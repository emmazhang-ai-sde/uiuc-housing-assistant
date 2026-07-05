# Waitlist 上线邮件：Outlook Mail Merge 发送方案

**Created: 2026-07-03**

给 60 个已登记的 UIUC waitlist 用户逐人发送上线通知邮件。用 Outlook 的 Mail
Merge（配合 Word + Excel），而不是写发送脚本或手动发 60 次。

---

## 1. 为什么选 Mail Merge，不选脚本群发 / 手动群发

- **不选脚本**：脚本群发意味着要把邮箱密码或授权 token 交给脚本，这 60 封邮件不
  值得为此承担凭据泄露的风险。Mail Merge 直接调用你本机登录的 Outlook 客户端，
  不涉及任何密码。
- **不选手动一封封发**：60 封纯靠复制粘贴容易出现漏发、重发、贴错收件人、格式
  跑偏。如果每封都要写不同的话（比如针对不同早期用户写个性化内容）才值得手动
  发；这次只是称呼统一成 "Hi,"，没有个性化内容，Mail Merge 更合适。
- Mail Merge 的效果：每人收到独立一封邮件，To 里只有他自己，邮件从你的 UIUC
  Outlook 正常发出，比原生连续发送更容易人工控制节奏。

## 2. 数据来源

名单不是手动整理的 CSV，是直接连 Supabase 的 `waitlist` 表读取（该表字段见
`frontend/app/coming-soon/page.tsx`：只有 `email`、`referral`、`created_at`，
**没有姓名字段**，signup 时只收集 NetID）。

脚本：`scripts/generate-mail-merge-batches.py`

```bash
source .venv/bin/activate
python scripts/generate-mail-merge-batches.py
```

脚本做的事：

1. 用 anon key 拉取 `waitlist` 表全部行（`email`, `created_at`, `referral`）。
2. 按 email 去重（转小写、去空格后比较，保留最早一条）。
3. 按 15 人一批切分，写出 `batch-1.xlsx` ~ `batch-4.xlsx`。
4. 额外生成一份 `batch-test.xlsx`，固定写入 3 个你自己的邮箱（不来自
   Supabase）：
   - `shuyangzhang.cs@gmail.com`
   - `shuyangzhang.live@gmail.com`
   - `sz94@illinois.edu`

输出目录 `scripts/mail-merge-batches/` 已加入 `.gitignore`，不会被提交（里面
是真实学生邮箱）。

当前实际数据：60 条 signup，去重后仍是 60（无重复），刚好整除成 4 × 15。

## 3. 称呼：不做个性化

原计划里想通过 Mail Merge 插入姓名，但 `waitlist` 表没有姓名字段，NetID 前缀
（如 `sz94`）不是真实姓名，硬插入体验反而奇怪。

最终方案：**不用合并域做称呼**。邮件正文里直接手打 "Hi," 作为统一开头，对所有
收件人一样。Excel 里也不再需要单独的 Greeting 列，只留 `Email` 这一列是
Mail Merge 真正要用的合并域，`SignupDate` / `Referral` 只是留着给你自己核对用,
不进正文。

## 4. 发送顺序

先用 `batch-test.xlsx`（3 个你自己的邮箱）跑一遍完整流程，确认：

- To 里确实只有单个收件人，不是群发到一个 To 里三个人
- 正文格式、图片、链接在 Gmail 和 Outlook 两端显示正常
- 落款、发件人显示的是你的 UIUC 身份

确认无误后，再按 `batch-1.xlsx` → `batch-2.xlsx` → `batch-3.xlsx` →
`batch-4.xlsx` 顺序发送正式名单，每批之间间隔 45–60 分钟手动启动下一批（原生
Mail Merge 不支持"每 15 封等一小时"这种节流，所以用分批文件 + 手动间隔代替写
定时脚本）。

## 5. 为什么一定要"Word 新建文档"

Mail Merge 本质上是 **Word 的功能**，不是 Outlook 的。Word 是"合并引擎"：它把
你写的邮件正文（Word 文档 = 模板）和 Excel 里的每一行数据结合，在内存里生成
N 份各自独立、只填了各自邮箱的邮件。

Outlook 本身不知道怎么读一个 Excel 表格然后循环发 N 封个性化邮件，它只在最后
一步（"完成并合并 → 发送电子邮件"）被 Word 调用，负责把 Word 已经生成好的这
N 封邮件通过你登录的账户实际发出去。所以：

- Word = 编辑正文 + 做合并的地方
- Excel = 数据源（收件人列表）
- Outlook = 最后真正发送的"邮局"，这一步跳不过，也没法只在 Outlook 里做

这也是为什么必须是 Mac 上的 **Word 桌面客户端**（不是网页版 Word），并且系统的
默认邮件客户端要设成 Outlook（macOS「邮件」App →「设置」→「通用」→「默认邮件
应用」选 Microsoft Outlook），否则「发送电子邮件」这一步找不到出口。

## 6. 实施步骤（Implementation Steps）

### 6.1 准备工作（只需做一次）

1. 确认 Mac 上装的是 **Word 桌面版**和 **Outlook 桌面版**（不是网页版
   outlook.com，网页版没有 Mail Merge 功能）。
2. macOS「邮件」App →「设置」→「通用」→「默认邮件应用」，选成
   **Microsoft Outlook**（Word 最后发送时会调用系统默认邮件客户端）。
3. 打开 Outlook，确认当前登录的账户是你的 UIUC Outlook（不是个人 Gmail /
   Outlook 账户）。

### 6.2 用 `batch-test.xlsx` 跑通一遍（先测试，再发正式名单）

1. 打开 Word →「新建空白文档」。
2. 顶部功能区切到 **「邮件」(Mailings)** 标签。
3. 点 **「开始邮件合并」(Start Mail Merge)** → 选 **「电子邮件」
   (Email Messages)**。
4. 点 **「选择收件人」(Select Recipients)** → **「使用现有列表」
   (Use an Existing List)** → 选中
   `scripts/mail-merge-batches/batch-test.xlsx`。
5. 弹窗会让你选工作表（一般叫 `Sheet1`），确认勾选了"首行是列标题"，点确定。
6. 在正文区域直接打字："Hi," 换行，然后写邮件正文（不需要插入任何合并域，
   称呼是固定文字，不是数据驱动的）。
7. 点 **「预览结果」(Preview Results)**，用左右箭头翻几条，确认 3 条记录都
   正常、没有多余字符。
8. 点 **「完成并合并」(Finish & Merge)** → **「发送电子邮件」
   (Send Email Messages)**。
9. 弹窗里：「收件人」选 `Email` 列，填好「主题」，「邮件格式」选 HTML（如果
   正文有排版/图片）或纯文本，点确定。
10. Word 会依次调用 Outlook 逐封发送，中途 macOS 可能会弹出"是否允许 Word
    访问 Outlook"之类的权限确认框（3 封邮件可能弹 1~3 次），点允许即可。
11. 去 Outlook「已发送邮件」核对：应该看到 3 封**各自独立**的邮件，每封 To
    栏只有一个地址，不是一封邮件 To 里塞了 3 个人。

### 6.3 确认无误后，发送正式的 4 个批次

对 `batch-1.xlsx` → `batch-2.xlsx` → `batch-3.xlsx` → `batch-4.xlsx`，重复
6.2 的步骤 2–10（数据源换成对应文件），每发完一批，等 45–60 分钟再开始下一批
（Word 里不需要重新写正文，只要在第 4 步重新「选择收件人」→ 换成下一个
`batch-N.xlsx` 即可，正文和格式设置会保留）。

## 7. 校验清单

- [ ] `batch-test.xlsx` 三封邮件都各自单独收到，To 里只有自己
- [ ] 正文里没有残留的合并域占位符（如 `«Email»` 忘记删除）
- [ ] 称呼统一显示为 "Hi,"，没有 NetID 或空白
- [ ] 确认发件人是 UIUC Outlook 账户
- [ ] 正式 4 批全部发出后，`scripts/mail-merge-batches/` 目录本地留档即可，
      不要提交到 git（已在 `.gitignore` 里)
