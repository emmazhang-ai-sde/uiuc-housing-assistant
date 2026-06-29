# Future Ideas

Ideas that are interesting but far from the current development focus. Nothing here is planned or scheduled — this is a place to park concepts so they don't get lost.

---

## Idea 1 — UIUC Sublet Community

A peer-to-peer sublet board built into the app, replacing the informal Facebook UIUC sublet groups with a cleaner, scam-resistant alternative.

### The problem with the Facebook group

- Anyone can post, including scammers and bots
- No verification of identity or UIUC affiliation
- UI is noisy and not purpose-built for housing
- Posts get buried; no structured search

### What this could look like

- **Post a sublet** — a registered UIUC student (verified `@illinois.edu` email) fills out a structured form: address, unit type, beds, rent, dates, photos, contact preference
- **Browse sublets** — same card/table/map views as the main listing search; sublets appear as a separate tab or filtered view
- **Communicate** — an in-app messaging thread per listing, visible only to logged-in UIUC students; no public-facing contact info
- **Trust layer** — every post and every message is tied to a verified `@illinois.edu` account; scam posts can be reported and the account flagged

### Why it fits this project

The authentication and UIUC-only access infrastructure (Priority 3 of the product launch plan) is already required for the main app. A sublet board reuses the same user accounts, the same verified email gate, and the same listing UI components. It's a meaningful extension, not a full rebuild.

### Open questions

- Moderation: who reviews flagged posts? Automated or manual?
- Listing expiry: posts should auto-expire after the sublet end date
- Photos: storage (Supabase Storage or Cloudflare R2)
- Legal: does facilitating peer-to-peer transactions change the non-commercial nature of the project?

---

## Idea 2 — Student Reviews & Xiaohongshu Integration

Real student opinions on buildings and property management companies, surfaced alongside listings. New students — especially incoming international students who haven't lived in Champaign — currently have no reliable way to know whether a building is well-maintained or whether a company's service is responsive.

### Two sources of review data

**Source A — Xiaohongshu (小红书)**

Xiaohongshu is heavily used by Chinese international students at UIUC to share housing experiences: noise levels, management responsiveness, maintenance quality, move-in/move-out disputes. This is an underutilized source of authentic, detailed opinions.

- Scrape posts tagged with relevant keywords (e.g. "UIUC 租房", "Champaign 公寓", building names)
- Extract: author (anonymized), date, sentiment, text content
- Store per building address, indexed in Chroma so reviews are surfaced in semantic search alongside listing metadata
- Content is primarily in Chinese — surface as-is for Chinese-speaking users; optionally run through a translation API for English-speaking users

Challenges: Xiaohongshu has strong anti-bot protections and its Terms of Service may restrict scraping. This needs careful legal review before building. Playwright with stealth plugins is likely required (similar to the Universities Group scraper).

**Source B — In-app user reviews**

Authenticated UIUC students (`@illinois.edu`) can leave structured reviews directly on the platform:

- Star rating (1–5) across dimensions: overall, management responsiveness, maintenance, value for money
- Free-text comment
- Move-in / move-out date (optional, adds context)
- Tied to a verified account — no anonymous posts, no scams

Because every reviewer is a verified UIUC student, these reviews carry more weight than anything on Google Maps or ApartmentRatings.

### How reviews surface in the UI

- Each listing card and detail panel shows an aggregate star rating + review count
- A "Reviews" tab in the detail drawer shows individual in-app reviews and Xiaohongshu excerpts side by side
- The RAG pipeline can incorporate review sentiment — e.g. "which 2BR buildings have good management?" surfaces properties with high management ratings

### Open questions

- Xiaohongshu ToS: confirm scraping is permissible before building
- Translation: free API (LibreTranslate) or paid (DeepL, Google Translate)?
- Review moderation: who handles flagged or defamatory content?
- Attribution: show Xiaohongshu as the source clearly so users know it is third-party content

---

## Idea 3 — Saved Properties Folder

Allow users to select listings from any search result and save them to a personal collection, so they can compare shortlisted options across multiple search sessions without re-running queries.

### What this looks like

- A checkbox or bookmark icon on each listing card and table row
- A "Save selected" button that adds the checked listings to the user's saved folder
- A "Saved" tab or sidebar section showing all saved properties, grouped by search session or sorted by date saved
- Users can remove listings from the folder individually or in bulk

### Why it's useful

A student searching for housing typically runs many queries over several days. Without a saved folder, they have to scroll back through conversation history to find a listing they liked — or worse, re-run the search hoping it appears again. A saved folder lets them build a personal shortlist across sessions.

### Implementation notes

- Saved listings are stored per user in the database (a `saved_listings` table: `user_id`, `listing_snapshot_json`, `saved_at`)
- Store a snapshot of the listing data at save time, not just the URL — availability and pricing can change, and users should know what they saw when they saved it
- Optionally flag saved listings that have since changed (price up, availability changed) by comparing the snapshot against the latest Chroma data

### Open questions

- Should users be able to annotate saved listings with personal notes?
- Should there be a share feature — e.g. send a saved folder link to a roommate?

---

## Idea 4 — On-Campus Housing Comparison for Freshmen

UIUC requires first-year students to live on campus under the Student Residence Requirement. This creates a distinct user segment — incoming freshmen who have no choice but to pick from university-managed residence halls, and who need help comparing options they've never seen in person.

### The problem

Currently, freshmen must piece together information from the official `housing.illinois.edu` website, Reddit threads, and word-of-mouth. There is no neutral, structured comparison tool. Social platforms like Niche.com provide dorm rankings but are generic and based on user reviews that may be outdated or unverified.

### What this could look like

- Scrape on-campus housing data from the official UIUC housing website: building names, room types (single, double, suite), dining hall proximity, amenity details, and pricing
- Store this in the same database as off-campus listings so the app becomes a single source for all UIUC housing — freshmen and upperclassmen alike
- A dedicated comparison view: select 2–3 residence halls side by side, compare price, room size, dining access, distance from key academic buildings, and amenities
- Filter by preferences: "quiet hall", "suite-style bathroom", "close to Grainger", "has AC"
- Optional: pull in verified student reviews from current/former residents (similar to the review system in Idea 2)

### Why it fits

The on-campus segment is underserved by the current off-campus–only tools. Adding on-campus data turns this app from a tool for returning students into the first housing tool a UIUC student uses — potentially building a habit before they ever need to search off-campus.

### Data source

`housing.illinois.edu` is the official UIUC housing site. Since it's a public university website with publicly listed information, scraping for non-commercial, student-benefit purposes is likely permissible — but should be verified against the site's terms before building.

### Open questions

- Does UIUC's housing office have an API or structured data export, or is scraping the only option?
- How frequently does on-campus pricing and availability change (semester vs. annual)?
- Should on-campus and off-campus listings appear in the same search results, or in separate tabs?

---

## Idea 5 — Academic Schedule–Based Housing Matching

Recommend housing based on where a student actually needs to be on campus, not just a generic "near campus" preference. A math student who has classes on the Main Quad every day has different proximity needs than a Gies business student whose lectures are in the Business Instructional Facility.

### Concept

1. **Scrape UIUC course and building data** from the official UIUC course explorer / class schedule website — building names, building coordinates, and which departments/courses are taught there
2. **User inputs their major or college** (e.g. Engineering, LAS, Gies) when they sign up or in their profile settings
3. **The system computes a weighted proximity score** — listings closer to the buildings most relevant to that major rank higher
4. **Natural language queries become richer** — "find housing for a CS student" automatically prioritizes proximity to Siebel Center and Thomas Siebel Hall without the user needing to specify coordinates

### Example matchings

| Major / College | Primary buildings to prioritize |
|---|---|
| Computer Science | Siebel Center, Thomas Siebel Hall, Grainger |
| Mathematics / LAS | Altgeld Hall, Main Quad |
| Gies Business | Business Instructional Facility (BIF) |
| Engineering (general) | Grainger Engineering Library, ECEB |
| Fine & Applied Arts | FAA Building |

### What's needed

- A building coordinate dataset scraped or exported from UIUC's official building directory
- A major → buildings mapping (could start as a hardcoded table, later made editable)
- User profile field: major / college (added at sign-up or in settings)
- A weighted proximity score incorporated into the RAG ranking, not just a hard filter — a listing 0.4 mi from BIF should still appear, just ranked lower than one 0.1 mi away

### Open questions

- How frequently does UIUC's building directory change? Is scraping reliable or is there an API?
- Should users be able to input a custom list of buildings instead of relying on major presets?
- How to weight proximity vs. price vs. availability in the final ranking?

---

## Idea 6 — UI Visual Overhaul

A dedicated design pass to make the interface feel more polished and intentional — beyond incremental tweaks. The current UI is functional but was built feature-first; this idea is about stepping back and redesigning it as a cohesive product.

### Direction

The existing Morandi color palette is a good foundation — muted, desaturated, easy on the eyes. A full visual overhaul would extend this into a complete design language: consistent spacing, typography hierarchy, micro-interactions, and a visual identity that feels purpose-built for UIUC students rather than a generic chat UI.

### Possible areas to explore

- **Landing / onboarding screen** — right now the app opens directly into the chat. A brief landing page or welcome screen would set context for new users and make a better first impression
- **Typography** — a more expressive font pairing (e.g. a display font for headings, a clean sans-serif for body) to give the UI a stronger personality
- **Card design** — more visual hierarchy within each listing card; potentially a thumbnail image slot once exterior photos are scraped (Phase 7)
- **Empty and loading states** — skeleton loaders, thoughtful empty state illustrations, and smooth transitions between search states
- **Dark mode** — the Morandi palette adapts naturally to dark backgrounds; a dark mode variant could feel very distinctive
- **Mobile responsiveness** — the current layout is desktop-first; a proper mobile experience would significantly expand the accessible user base

### When to do this

After the product is live and real users are using it. Design investment pays off more once there is user feedback about what parts of the UI are confusing or underused.

---
