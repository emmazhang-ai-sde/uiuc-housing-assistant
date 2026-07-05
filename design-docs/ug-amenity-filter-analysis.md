# University Group — Amenity/Tagline Filter Analysis

**Created: 2026-07-02**

← Back to [Filter System](filter-system.md)

---

## Question

Can `tagline` and `availability_summary` (already scraped, 159/159 building coverage) be mined for new structured filter conditions — e.g. a "big windows" style feature filter? And more broadly, what feature-level marketing content actually exists on University Group's site that we aren't capturing yet?

---

## Method

1. Deduped `data/universities_group_raw.json` (389 unit rows) down to 159 unique buildings by `url`.
2. Ran keyword regexes over `tagline` and `availability_summary` for all 159 buildings.
3. Found neither field contains feature-level content, so re-inspected the live `property-details` HTML (via Playwright) for a richer source. Discovered a `div.more_read` block — page headline, promo banner, a free-text marketing paragraph, and (on some pages) a bulleted `<ul><li>` amenities list — that the production scraper does not currently parse.
4. Wrote a one-off script to fetch this block from all 159 property pages (not committed to `scrapers/` — exploratory only) and ran the same keyword scan against it.

---

## Finding 1 — `tagline` is condition/marketing framing, not features

83 of 159 buildings have a non-empty tagline (44 empty). Content skews toward renovation status, luxury framing, and location callouts — not physical features:

| Pattern | Buildings (of 159) |
|---|---|
| Renovated / remodeled | 37 |
| Near-campus / location callout | 23 |
| Luxury | 17 |
| Brand new | 10 |
| Move-in special / rate | 3 |
| Roommate matching | 2 |

No occurrences of window size, view, or natural-light language anywhere in this field.

## Finding 2 — `availability_summary` is pure leasing status

36 distinct non-empty values (12 empty), and every one of them is a leasing-status or scarcity message:

| Pattern | Buildings (of 159) |
|---|---|
| "Available August 2026" style | 96 |
| "Fully Leased" / "Unavailable" | 68 |
| "X left!" scarcity | 9 |
| "Brand New for [date]" | 5 |

This field carries zero feature content. **Neither existing field is a usable source for amenity-style filters.**

## Finding 3 — the real feature data lives in an unscraped block, and it's sparse

The `div.more_read` block on each property-details page can contain a free-text description and/or a bulleted amenities list. Across all 159 properties:

| | Count | % of 159 |
|---|---|---|
| Has bulleted amenities list | 13 | 8% |
| Has free-text description | 6 | 4% |
| Has neither | 145 | 91% |

This content only appears on University Group's newer "flagship" developments (e.g. 303 E. Chalmers, 412 E. Healey, 502 E. Healey, 505 S. First, 605 S. Fourth, 75 E. Armory, 901 W. Western) — older/smaller listings use a bare-bones template with no marketing copy at all.

### Feature frequency among the 13 buildings that have this content

| Feature | Buildings |
|---|---|
| Fully furnished | 13 |
| In-unit laundry / washer-dryer | 11 |
| Fiber / wireless internet included | 11 |
| Security cameras / access control | 11 |
| Hardwood / plank flooring | 8 |
| Stainless steel appliances | 8 |
| Parking (covered/garage/off-street) | 8 |
| Balcony / patio / terrace | 7 |
| Smart TV / flatscreen TV | 7 |
| Elevator | 5 |
| Bike storage | 5 |
| Utilities included (water/sewer) | 5 |
| "Large/huge" size claims | 5 |
| Fitness center / gym | 4 |
| Package room | 4 |
| Roommate matching | 4 |
| Brand new construction | 2 |
| Dishwasher | 2 |
| Walk-in closet | 1 |
| Granite countertops | 1 |
| Central AC | 1 |

### "Big windows" specifically

Not found — no window-size, natural-light, or fenestration language anywhere in tagline, availability_summary, or the amenities block, across all 159 buildings. The closest analogues are generic size adjectives ("huge balconies", "exceptionally large floor plans", "spacious") tagged above under **"Large/huge" size claims**. Treat "big windows" as a stand-in example rather than a real extractable field — it isn't advertised copy University Group uses.

---

## Implications

- **Coverage is the blocker, not extraction.** Regex/keyword extraction from this block works fine (verified above); the problem is 91% of buildings would show `unknown` for every amenity tag, which makes a filter UI more confusing than useful (can't distinguish "doesn't have it" from "not advertised").
- Because this content is unstructured freeform marketing text (not sitewide fixed fields like Availability/Bathrooms), any extraction is inherently keyword/heuristic-based and will miss paraphrased amenities (e.g. "plank flooring" vs "hardwood" vs "wood-style floors" all mean the same thing but need alias lists).
- Amenity presence correlates with property age/tier — a "has in-unit laundry" filter built from this data would implicitly bias toward flagship/luxury buildings, not reflect true amenity presence across the portfolio.

## Options going forward

1. **Skip it for now.** Not worth building a filter with 91% `unknown` values.
2. **Best-effort enrichment, not a filter.** Scrape `description` + `amenities` raw text where present and surface it as supplementary listing detail (e.g. an "amenities" chip row on the property card, shown only when data exists) — no new hard filter, no `unknown` state to design around.
3. **Revisit later.** If University Group expands this template to more properties over time, re-run this analysis before committing to filter UI.

Recommendation: **option 2** — capture `description` + `amenities` as optional display-only fields alongside the existing scrape, skip building filter/search logic on top of them until coverage improves.

## If pursued: proposed schema addition

Extend `scrapers/universities_group.py::parse_property()` to also parse `div.more_read` once per property (not per unit tab):

```python
"description": "",   # free-text paragraph, empty for ~96% of buildings
"amenities":   [],   # list[str] from <ul><li>, empty for ~92% of buildings
```

No changes to `build_where()` / Chroma metadata filters needed under option 2 — these fields would be display-only, not queryable.

---

## Update 2026-07-02 — correction: a real structured feature taxonomy exists

The recommendation above was based only on freeform marketing text (`tagline`, `availability_summary`, `div.more_read`). The user then supplied a list of 23 feature names (24-Hour Maintenance, Brand New, Dishwasher, Elevator, Fiber internet, Fitness Center, Furnished, Hardwood Floors, In-unit Laundry, Multi-level, Newly Remodeled, Off Street Parking Available, Onsite Laundry, Private Balconies, Private Patios, Roommate Matching, Secure Building, Smart TV, TV, Unfurnished, Vaulted Ceilings, Washer & Dryer Hookup, Wireless internet). These do **not** come from any field analyzed above — they come from University Group's own site search.

### Where this list actually lives

`https://ugroupcu.com/apartment-search/` has a `<select name="feature[]" id="feature" multiple>` filter control with 23 `<option>`s, each a fixed feature name + a stable numeric ID:

| ID | Feature | ID | Feature |
|---|---|---|---|
| 15 | 24-Hour Maintenance | 11 | Newly Remodeled |
| 24 | Brand New | 2 | Off Street Parking Available |
| 7 | Dishwasher | 1 | Onsite Laundry |
| 29 | Elevator | 3 | Private Balconies |
| 26 | Fiber internet | 4 | Private Patios |
| 23 | Fitness Center | 27 | Roommate Matching |
| 19 | Furnished | 5 | Secure Building |
| 9 | Hardwood Floors | 28 | Smart TV |
| 10 | In-unit Laundry | 6 | TV |
| 13 | Multi-level | 31 | Unfurnished |
| | | 12 | Vaulted Ceilings |
| | | 21 | Washer & Dryer Hookup |
| | | 30 | Wireless internet |

This is a **fixed, sitewide taxonomy defined in University Group's own backend** — not scraped marketing copy — so it doesn't have the "freeform text, needs alias matching" problem from Findings 1–3, and per-property membership is a real yes/no fact in their database, not something we'd be inferring.

### Confirmed queryable and per-property (not just a static list)

Verified by driving the search form with Playwright: setting `#feature` to value `29` (Elevator) and submitting returns a **different set of properties** than the unfiltered baseline (e.g. 901 W. Western, 75 E. Armory, 303 E. Chalmers, 605 S. Fourth appear only in the filtered set). This confirms the site filters real property↔feature membership server-side — it isn't a decorative dropdown with no backing data.

The search submits via AJAX (WordPress `admin-ajax.php`), and results appear to load via infinite scroll rather than numbered pagination — full-coverage extraction still needs to handle that (page through/scroll each of the 23 single-feature searches to get the complete matching set, not just the first ~20 results shown).

### Revised recommendation

This changes Option selection from Finding 3: since membership is structured and site-defined (not keyword-inferred from prose), a real filter is now justified — the earlier "91% unknown" sparsity problem was specific to the marketing-copy fields, not to this feature taxonomy. **Next step, if approved:** write a scraper that runs one filtered search per feature ID (23 requests), pages/scrolls each to completion, and unions the results into a `property_url → set[feature_id]` map, then joins that onto `data/universities_group_raw.json` by URL. This has not been built yet — the above is a feasibility check only, not an implementation.

---

## 补充 2026-07-02 — 合法性评估与抓取方案（用户要求本节用中文记录）

### 合法性评估（非正式法律意见）

1. **robots.txt 完全开放** — `curl https://ugroupcu.com/robots.txt` 显示 `Disallow:` 为空，没有任何路径被禁止爬取，`/apartment-search/` 也在允许范围内。这跟本项目现有 scraper 已经在爬的 `/building-list/`、`/property-details/` 是同一份 robots.txt 授权。
2. **网站没有 Terms of Service / Terms of Use 页面** — 检查了 sitemap 全部页面列表和首页 footer，没有找到任何"禁止自动化访问/爬取"的条款页面，因此不存在需要点击同意、可能构成 breach of contract 的 ToS。
3. **数据本身公开、无需登录即可访问** — 美国判例法（如 *hiQ Labs v. LinkedIn*，第九巡回法院）认为，爬取无需身份验证、公开可访问的数据一般不构成 CFAA（计算机欺诈与滥用法）意义上的"未经授权访问"，这与破解登录墙/付费墙性质不同。
4. **抓取目标是事实性数据，不是版权内容** — 这次要提取的是"某栋楼是否具备电梯/洗碗机"这类布尔值 feature 标记，不是逐字复制营销文案全文。事实本身不受版权保护（*Feist v. Rural Telephone*），比之前分析营销文案全文更安全。

**唯一的灰色地带**：现有 scraper 为绕过 Incapsula 机器人拦截，使用了 `navigator.webdriver` 伪装、真实 User-Agent、warm-up session 等手段——这类"绕过反爬虫技术措施"的行为比单纯读取公开页面更容易引起争议（尽管目前没有判例认定这类基础伪装本身违法）。既然项目里已经在用同一套手段爬同一个网站，本次会延续同样的节奏（4-5 秒爬取间隔，不高频请求 AJAX 接口），不加大侵略性；若对方发律师函/cease-and-desist，应立即停止。

**结论**：在当前使用场景下（个人作品集项目、非商业、内部使用、数据公开、robots.txt 允许、无 ToS 限制），风险很低，可以进行。

### 抓取思路

1. **逐 feature 跑筛选**：对 23 个 feature ID（15, 24, 7, 29, 26, 23, 19, 9, 10, 13, 11, 2, 1, 3, 4, 27, 5, 28, 6, 31, 12, 21, 30）各发起一次搜索请求，每次只勾选一个 feature。
2. **翻完整结果**：结果是无限滚动加载而非分页，首屏只显示约 20 条。需要让 Playwright 持续滚动/触发加载直到结果不再增加，拿到该 feature 下**全部**匹配的楼。
3. **汇总成 `property_url → set[feature_id]` 映射**：23 次搜索结果取并集去重，反推出每栋楼具备哪些 feature。
4. **按 URL 合并回 `data/universities_group_raw.json`**：给每条记录加上 `features: List[str]` 字段（用 feature 名而非数字 ID，方便前端展示/筛选）。
5. **控制节奏**：复用现有 `CRAWL_DELAY = 5s` 的礼貌间隔，23 次搜索 × 滚动加载，预计比之前 159 页全量抓取更快完成。
