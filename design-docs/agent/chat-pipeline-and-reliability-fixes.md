# `/chat` 请求处理流程与本轮可靠性修复

**Created: 2026-07-01**

> 本文档例外使用中文撰写（其余 design docs 按项目约定统一使用英文）。

← Back to [Agent Architecture](agent-architecture.md) · 另见 [Groq Tool Calling](groq-tool-calling.md)

---

## 1. 概述

本文档记录一轮会话中排查并修复的一系列问题，覆盖后端 checkpoint 裁剪、前端多会话并发状态、Groq `tool_use_failed` 可靠性问题、system prompt 从"死板表单"到"自然对话"的重写，以及**最核心的一处架构调整**：把"从对话里提取搜索条件"这件事，从"依赖 agent 自己判断"改成"后端确定性提取"。

在讲每个修复之前，先把当前 `/chat` 请求的完整流程讲清楚——这是理解后面所有改动为什么这么做的前提。

---

## 2. `/chat` 请求的完整流程（当前实现）

一个常见的误解是："陪你聊天的那个 AI，会自己去理解你说的价格、户型、时间，然后去数据库里搜。" 这基本上是**旧架构**的做法（见 [unified-chat-ui.md](unified-chat-ui.md) 里最初的设计），但经过本轮修复，**已经不是这样了**。原因很直接：小模型跨多轮对话去精确填充结构化参数（预算下限、户型、可入住时间……）非常不可靠，实测下来会漏填、错填。

现在的流程把"理解对话"拆成了两个独立的步骤，职责分开：

```
用户发一条消息
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 步骤 1 — 从对话里确定性地提取 filter（后端，不是 agent）        │
│                                                               │
│   extract_filters(message, history)   ← 单独的小模型调用       │
│        │  (llama-3.1-8b-instant，只做结构化解析，不聊天)         │
│        ▼                                                     │
│   { beds, min_price_per_bed, max_price_per_bed,              │
│     availability_window, location_hint, property_type, ... } │
│        │                                                     │
│        ▼                                                     │
│   merge_filters(nl_filters, explicit_UI_filters)              │
│     — FilterPanel 里显式设置的值优先                            │
│        │                                                     │
│        ▼                                                     │
│   + available_only 默认 True（隐藏已租满的房源）                 │
│   + 如果预算来自对话（不是面板输入），buffer 改成 exact           │
│     （面板默认的 +15% 缓冲是为面板输入设计的，不该套在                │
│       用户已经明确说出的价格区间上）                              │
│        │                                                     │
│        ▼                                                     │
│   写入 ui_filters（ContextVar，请求级别，finally 里 reset）      │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 步骤 2 — agent 聊天 + 判断要不要搜索（llama-3.3-70b-versatile）  │
│                                                               │
│   agent 只做两件事：                                            │
│     a) 自然地回应用户（闲聊 / 答疑 / 确认理解）                   │
│     b) 判断这一轮该不该调用 housing_search 工具                  │
│   agent 完全不负责填 filter 参数 —— housing_search 的签名        │
│   现在只有一个参数：query（自由文本，只影响语义排序，不影响筛选）  │
└─────────────────────────────────────────────────────────────┘
    │  （若 agent 决定调用 housing_search）
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 步骤 3 — 真正查数据库                                          │
│                                                               │
│   housing_search(query):                                     │
│     filters = ui_filters.get()          ← 读步骤 1 算好的结果   │
│     where   = build_where(filters)      ← 转成 Chroma 元数据过滤 │
│     docs    = get_filtered_docs(query, where)  ← 先硬筛，再语义排序│
│     docs    = filter_by_location(docs, location_hint)         │
│     return summary_text, listings       ← listings 是原始数据库记录│
└─────────────────────────────────────────────────────────────┘
    │
    ▼
backend/main.py /chat 收尾:
  - 扫描 result["messages"]，找 ToolMessage(name="housing_search")
    → 有就说明这轮真的搜索了，listings 取它的 .artifact
    → UI 靠这个来决定要不要显示卡片网格，不依赖模型文本里的任何标记
  - filters_applied：如果这轮搜索了，返回步骤 1 算出的 search_filters
    （不是只返回 FilterPanel 的原始状态）
  - 返回 { answer, listings, filters_applied }
```

**这样设计的核心原因：** 聊天（自然语言理解、语气、追问）和检索（精确的价格/户型/可入住状态过滤）对模型能力的要求完全不同。前者需要"像人一样说话"，后者需要"绝对精确、不能漏"。把两者交给同一次 LLM 生成去同时做，就是本轮大部分 bug 的根源（详见第 4.5 节）。拆开之后，70b 模型专心聊天，8b 模型专心做结构化抽取，各自都更可靠。

---

## 3. 卡片（Card）是什么、从哪来

卡片上的地址、价格、户型、可入住状态、图片 URL 等**全部是数据库原始记录**（`doc.metadata`），不是模型生成的。模型只负责：

1. 判断要不要搜索、要不要问澄清问题（agent，70b）
2. 写卡片网格上方那一句总结文字，例如"找到 23 套 studio，价格 $1165–$1490"（`summarize()`，8b）

模型**不会、也不能**编造卡片里的任何字段——这些字段来自 `housing_search` 工具返回的 `artifact`（原始 `list[dict]`），前端 `AssistantMessage.tsx` 直接拿去渲染 `ListingCard`。

---

## 4. 本轮修复的问题清单

### 4.1 Checkpointer 裁剪切断 tool_call / tool_response 配对

**现象：** 对话进行几轮之后，偶发 `groq.BadRequestError: 400 — assistant message with tool_calls must be followed by tool messages`。

**根因：** `backend/main.py` 里为了控制 Groq 的 TPM 限制，每轮结束后会用 `RemoveMessage` 裁剪掉过旧的消息（`MAX_CHECKPOINTED_MESSAGES = 12`）。旧实现是简单的 `stored[:-MAX_CHECKPOINTED_MESSAGES]` 切片，如果切割点恰好落在一个"`AIMessage(tool_calls=...)` + 它对应的 `ToolMessage`"之间，就会把两者拆开——留下一个悬空的 tool_call，下一次请求发给 Groq 时直接被拒绝。

**修复：** 按"整轮对话"（从每个 `HumanMessage` 开始算一轮）分组，只从最旧的一端整轮整轮地丢弃，绝不会切在 tool_call/tool_response 中间。

```python
# backend/main.py /chat
turns: list[list] = []
for m in stored:
    if isinstance(m, HumanMessage) or not turns:
        turns.append([m])
    else:
        turns[-1].append(m)
while len(turns) > 1 and sum(len(t) for t in turns) > MAX_CHECKPOINTED_MESSAGES:
    turns.pop(0)
kept_ids = {m.id for t in turns for m in t}
to_drop = [m for m in stored if m.id not in kept_ids]
```

---

### 4.2 前端：等待回复时开新会话被卡住

**现象：** 在会话 A 等 AI 回复时，点"New Chat"开会话 B，B 里出现一个永远转不完的"..."，输入框也被禁用，发不出消息。

**根因：** `frontend/hooks/useChat.ts` 里 `isLoading` 是**全局唯一**的一个 boolean，不区分会话。会话 A 的请求还没返回时，`isLoading` 全局是 `true`，导致：
- `MessageInput` 的 `disabled={isLoading}` 把所有会话的输入框都禁用了；
- `ChatWindow` 在会话 B（消息列表为空）也渲染出了 `{isLoading && <TypingIndicator/>}`，看起来像是"B 也在等回复"。

**修复：** 把 loading 状态从单个 boolean 改成按会话 ID 索引的 map：

```typescript
// hooks/useChat.ts
const [loadingByConv, setLoadingByConv] = useState<Record<string, boolean>>({})
const isLoading = activeId ? !!loadingByConv[activeId] : false
```

每次 `sendMessage` 只读写自己那个 `convId` 对应的 loading 状态，会话之间互不影响。

---

### 4.3 `tool_use_failed`：三种不同成因，本轮命中第三种

[groq-tool-calling.md](groq-tool-calling.md) 之前已经记录了 `tool_use_failed` (HTTP 400) 的两种成因：

| | Cause 1（格式） | Cause 2（内容混杂） |
|---|---|---|
| 问题 | 模型吐出 Llama XML 格式而非 OpenAI JSON | prompt 强制模型在 tool-calling 轮次里夹带自定义文本标记（如 `[LISTINGS]`） |
| 触发模型 | `llama-3.1-8b-instant` | 任意模型，只要 prompt 要求这么做 |

本轮遇到的是**第三种**、此前未记录的成因：

**现象：** 用户只是打了句 "hi"，模型根本没打算调用任何工具，纯文本回复也被 Groq 拒绝：

```
groq.BadRequestError: 400 — tool_use_failed
'failed_generation': 'Got it — You need help with housing search.\nWould you like a small buffer?...'
```

`failed_generation` 字段里是完整的**自然语言文本**，不是任何形式的函数调用尝试——但 Groq 依然把整轮判定为"函数调用失败"并拒绝。

**根因（Cause 3 — 模型级可靠性问题）：** 这不是我们的 prompt 或代码问题，而是 `meta-llama/llama-4-scout-17b-16e-instruct` 在 Groq 上做 tool calling 时**已知的、间歇性的不稳定问题**——即使工具绑定在请求里、模型也没打算调用它，Groq 侧的解析器仍可能误判。social/社区证据：

- [Groq Community: "Tool_use_failed on Llama4 models"](https://community.groq.com/t/tool-use-failed-on-llama4-models/427)
- [agno-agi/agno#4090](https://github.com/agno-agi/agno/issues/4090) — 报告 Llama 4 系列模型工具调用失败率接近 100%，而 `llama-3.3-70b-versatile` 接近 0%
- [pydantic-ai#4350](https://github.com/pydantic/pydantic-ai/issues/4350) — 与本次现象完全一致的 `failed_generation` 非工具调用文本案例

**修复（两处，互补）：**

1. **切换模型**：`rag/agent.py` 从 `meta-llama/llama-4-scout-17b-16e-instruct` 改为 `llama-3.3-70b-versatile`（社区报告可靠性显著更高）。
2. **重试兜底**：因为这个问题本质上是间歇性的，`backend/main.py` 在 `/chat` 里对 `groq.BadRequestError` 做了针对性重试——只在 `code == "tool_use_failed"` 时重试一次，其他错误码原样抛出：

```python
payload = {"messages": [HumanMessage(content=user_message)]}
try:
    result = await agent.ainvoke(payload, config=config)
except GroqBadRequestError as e:
    body = e.body if isinstance(e.body, dict) else {}
    code = (body.get("error") or {}).get("code")
    if code != "tool_use_failed":
        raise
    result = await agent.ainvoke(payload, config=config)  # 同一个 payload，避免重复写入历史
```

**遗留事项：** [groq-tool-calling.md](groq-tool-calling.md) 的"Decision"一节仍然把 `llama-4-scout` 列为"current default"，与本次改动冲突，需要后续单独更新（本文档不改动该文件的英文正文，仅在此提示）。

---

### 4.4 System Prompt：从"死板表单"到"自然对话 + 意图判断"

**现象（用户实测反馈，两轮）：**

1. 打招呼 "hi" 也会收到整套固定模板："Got it — you're looking for housing assistance... Would you like a small buffer?..."
2. 用户说了句可能打错的 "4th semester"，模型既不确认也不追问，直接照单全收；紧接着用户问了个无关的追加问题（"is it too late to sign a lease?"），模型答完之后又机械地把整套确认模板重新贴了一遍。

**根因：** 旧版 system prompt 把自己定位成"housing 搜索机器人"，并且要求 STEP 1 必须**逐字复用**一个固定格式的确认模板——模型因此把每一条消息都当成搜索请求来套模板，且不会区分"这轮该不该重新确认"。

**修复：** 重写 `rag/agent.py` 的 `_SYSTEM`，核心变化两处：

1. **加一层意图判断**（在进入任何搜索流程之前）：
   - **A) 闲聊/一般问题** → 像 ChatGPT 一样自然回应，每次措辞不同，不主动提搜索表单
   - **B) 真正的租房需求**（预算/户型/地段/入住时间/明确要求推荐）→ 才进入两步搜索流程
   - 不确定时默认按 A 处理

2. **把 STEP 1 从"固定格式"改成"自然确认"**：不再要求逐字模板，而是要求：用自己的话复述理解 → 遇到模糊/疑似笔误主动确认（"did you mean…?"）→ 一次最多问一个引导性问题，绝不一次性抛出全部澄清问题。

3. **新增"HANDLING FOLLOW-UPS MID-SEARCH"一节**：用户在搜索流程中途问别的问题时，自然作答即可，明确禁止重新贴确认模板或重启流程。

修复后实测（同一场景复现）：
- "hi" → "How's it going? Just getting started with the semester...”（自然、每次不同）
- "4th semester" → 模型主动推断"大概是 1 月"并追问预算，而不是照单全收
- 追问租约问题后 → 自然作答 + 结尾一句轻量引导（"Would you like me to go ahead and search..."），不再重贴表单

---

### 4.5 核心架构调整：filter 提取从"agent 自己填"改成"后端确定性抽取"

这是本轮最重要的一处改动，直接对应用户提出的两个问题：**"用户已经说了不想看 $1000 以下的，为什么还显示？"** 和 **"用户已经开始找房了，为什么还给他看已租满（Fully Leased）的房源？"**

**根因排查过程：**

第一次尝试是把 `housing_search` 的参数从单一 `query: str` 扩展成结构化参数（`beds`, `min_price_per_bed`, `max_price_per_bed`, `availability_window`, `available_only`, `location_hint`），指望 agent（70b 模型）在决定调用工具时把这些参数从多轮对话里正确填出来。

**实测结果（复现用户报的真实对话）：** 可用性过滤生效了（0 条 leased/unavailable，因为 `available_only` 在函数签名里默认 `True`，模型不填也生效）；但**预算下限和户型完全没被模型正确填出来**——返回的 50 条结果里，36 条低于 $1000，还混入了用户明确说不要的 2 居室。说明"依赖 agent 在多轮上下文里精确填结构化参数"这条路本身就不可靠，即使已经在 system prompt 里写了详细的字段说明和示例。

**最终方案：** 放弃让 agent 填参数，改成 [第 2 节] 描述的架构——`housing_search` 的签名收回成只有 `query: str`，真正的过滤条件由 `/chat` 端点在**调用 agent 之前**，用一次独立、确定性的 `extract_filters()` 调用（8b 模型，专职做结构化解析，不涉及对话决策）解析出来，写入 `ui_filters`，供 `housing_search` 读取。

**同时补上两处 `rag_chain.py` 里原本没有的能力：**

1. **价格下限（`min_price_per_bed`）**：`build_where` 新增 `price_per_bed_low >= min` 子句——按卡片上显示的"标价（低）"过滤，确保"低于 $1000 的完全不出现"，而不是只保证均价达标。
2. **默认只看可租房源（`available_only`）**：新增 `is_available == True` 子句，作为**没有指定具体可入住窗口时**的默认行为——一个正在搜房的学生，默认想看的是能租的房子。若用户明确要看某个入住窗口（如 "fall semester" → `availability_window="august_2026"`）或明确要看已租满的房源（`"leased"`），这两者的优先级高于默认值。

**复现验证（同一场景）：**

| | 修复前 | 修复后 |
|---|---|---|
| 总结果数 | 50（等于"show me everything"） | 23（studio，符合预算+可入住条件） |
| 低于 $1000 的条数 | 36 | 0 |
| 已租满（leased）条数 | 0（凑巧靠函数默认值躲过） | 0（现在是确定性保证） |
| 户型 | 混入 2 居室 | 全部 studio |
| 价格区间 | 未受约束 | $1165–$1490（符合 $1000–$1300 + 面板 15% 缓冲，或对话预算原样精确应用） |

**附带修的一个细节：预算缓冲（buffer）不该套在对话里说出的精确区间上。** FilterPanel 默认给用户在面板里填的价格加 15% 缓冲（`buffer_type: "percent", buffer_value: 15`），这个设计是给"面板输入"用的。但如果用户在对话里已经明确说"$1000 到 $1300"，这本身就是精确区间，不该再叠加缓冲变成 $1495 上限。`/chat` 里判断：只要预算来自 NL 提取、且面板本身没有设置价格，就把 `buffer_type` 强制改成 `"exact"`。

**结果头部同步：** 之前搜索结果上方的黑色总结框（"Bedroom: Any / Budget: No limit / Source: All"）只读 FilterPanel 快照，即使对话里实际应用了过滤条件也不会更新，显得很奇怪。现在 `/chat` 返回的 `filters_applied` 改为返回**这一轮真正生效的过滤条件**（NL 提取 + 面板 + `available_only` 默认值的合并结果，而非仅仅是面板原始状态），前端 `SearchSummary` 组件相应改为优先读这份数据。

---

### 4.6 价格下限的方向识别：`extract_filters` 把"以上（above）"当成了"以下"

这是 4.5 的一个后续 bug。4.5 给 `build_where` 补上了 `min_price_per_bed` 的能力，但 `extract_filters` 的 prompt 本身**并没有教会模型识别"下限方向"的措辞**，导致这个能力在真实对话里被架空。

**现象（用户实测复现）：** 多轮对话里先确定了"1 居室、$1000–$1300"，随后用户改主意说 **"I only want to take a look at studios above $1,500."**。结果搜索结果头部的预算显示成 **"No limit"**，卡片里出现的仍是 $1,125–$1,225 这类**低于 $1,500** 的房源——也就是说 "above $1,500"（价格下限 ≥ 1500）这个约束完全丢了。

**根因：** `EXTRACT_PROMPT` 里对价格的规则有两个缺口：

1. `min_price_per_bed` 的说明只列了 "nothing under $1000"、"at least $900"、"avoid cheap ones under X" 这几种floor措辞，**没有覆盖 "above / over / more than $X"** 这类最直白的下限表达。
2. 更糟的是，有一条 "amount > $1,500 → `max_price_total`" 的启发式规则，会**抢先**把 $1,500 这个数字塞进"总价上限"字段。于是模型看到 "above $1,500" 时，要么把它错当成上限（`max_price_total: 1500`），要么干脆不填（→ "No limit"）。

修复前实测（同一输入跑 3 次）：0/3 命中，分别得到 `max_price_total: 1500` / 空 / `max_price_total: 1500`——**方向被彻底搞反或丢弃**。

**修复：** 重写 `EXTRACT_PROMPT` 的价格段落，把"先判断方向（下限 floor / 上限 ceiling），再选字段"这个顺序显式写进 prompt：

- **下限词**（floor → `min_price_per_bed`）：`above` / `over` / `more than` / `greater than` / `at least` / `no less than` / `starting at` / `$X and up` / `nothing under $X`
- **上限词**（ceiling → `max_price_*`）：`under` / `below` / `less than` / `at most` / `up to` / `max` / `no more than` / `within $X` / `budget of $X`
- 区间（"$1000 to $1300"、"between … and …"）→ 同时设 min 和 max
- 关键约束一句：**"above/over/more than $X 永远是下限，绝不放进任何 max 字段"**——把方向判断置于"per-bed vs total 金额启发式"之前，防止金额规则再次抢跑
- 新增两个示例：`"studios above $1,500"` → `min_price_per_bed: 1500`；`"1br over $1200 per bed"` → `min_price_per_bed: 1200`

**复现验证：**

| 输入 | beds | min | max/bed | 结果 |
|---|---|---|---|---|
| "studios **above** $1,500" | 0 | **1500** | – | ✅ 下限（修复前 → "No limit"） |
| "1br **over** $1200 per bed" | 1 | **1200** | – | ✅ 下限 |
| "studios **between** $1000 and $1300" | 0 | 1000 | 1300 | ✅ 区间未回归 |
| "1 bed **under** $900 available now" | 1 | – | 900 | ✅ 上限 + 可入住窗口未回归 |

"above $1,500" 现在 3/3 稳定命中。前端无需改动——`AssistantMessage.tsx` 的 `formatBudget()` 早已支持"仅有下限"的情形（渲染成 `≥ $1,500/bed`），此前只是永远收不到这个值而已。

**遗留提示：** 抽取模型是 Groq 免费档的 `llama-3.1-8b-instant`（6k TPM，能力偏弱），对少数边缘措辞（如 "anything under $800"）偶有单次抖动。若要让这类查询彻底稳定，杠杆更高的做法是升级抽取模型，而非继续堆 prompt 规则。

---

## 5. Affected Files

| 文件 | 改动 |
|---|---|
| `backend/main.py` | checkpoint 按整轮裁剪；`tool_use_failed` 重试；`/chat` 中确定性 `extract_filters` + `merge_filters` + `available_only` 默认值 + NL 预算 exact 处理；`filters_applied` 返回真实生效值 |
| `rag/agent.py` | 模型从 `llama-4-scout` 切换到 `llama-3.3-70b-versatile`；system prompt 重写（意图判断 + 自然对话 + 追问处理）；`housing_search` 签名收回为单一 `query` 参数 |
| `rag/rag_chain.py` | `build_where` 新增 `min_price_per_bed`（价格下限）与 `available_only`（默认只看可租房源）子句；`extract_filters` 的 prompt 增加 `min_price_per_bed` 字段与示例；**（4.6）** 重写价格段落，显式区分"下限词 / 上限词"，修复 "above/over $X" 被错当成上限或丢弃的问题 |
| `frontend/hooks/useChat.ts` | `isLoading` 从全局 boolean 改为按会话 ID 索引（`loadingByConv`） |
| `frontend/components/AssistantMessage.tsx` | `SearchSummary` 改为优先读 `filtersApplied`（真实生效的过滤条件），而非只读 FilterPanel 快照 |

---

## 6. 关联文档

- [Agent Architecture](agent-architecture.md) — 整体架构与分层
- [Groq Tool Calling](groq-tool-calling.md) — `tool_use_failed` 的前两种成因（格式 / 内容混杂）；本文档第 4.3 节补充了第三种（模型级可靠性问题）
- [Unified Chat UI](unified-chat-ui.md) — 注意：该文档中 "Data Flow" 一节描述的是 `extract_filters` **在 `housing_search` 内部**调用的旧架构，已被本文档第 2 节的新架构取代（`extract_filters` 现在是 `/chat` 端点里独立于 agent 的确定性前置步骤）
