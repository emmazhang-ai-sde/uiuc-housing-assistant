"""
Audit script — Universities Group apartment-search page.

Fetches https://ugroupcu.com/apartment-search/ via Playwright and prints:
  - All <img> src/data-src attributes and their parent element classes
  - All <a href> links that look like property detail pages
  - The class names of every top-level "card" wrapper around images
  - A raw HTML dump of the first property card (for structure inspection)

Run:
    python scripts/audit_ug_search.py
"""

import time
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

URL = "https://ugroupcu.com/apartment-search/"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


def fetch_html(url: str) -> str:
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox"],
        )
        ctx = browser.new_context(
            user_agent=USER_AGENT,
            viewport={"width": 1280, "height": 800},
            locale="en-US",
            timezone_id="America/Chicago",
        )
        page = ctx.new_page()
        page.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )

        print("Warming up session on homepage...")
        page.goto("https://ugroupcu.com/", wait_until="domcontentloaded", timeout=20000)
        time.sleep(2)

        print(f"Loading: {url}")
        page.goto(url, wait_until="networkidle", timeout=30000)
        time.sleep(4)  # let JS-rendered content settle

        html = page.content()
        browser.close()
    return html


def audit(html: str) -> None:
    soup = BeautifulSoup(html, "html.parser")

    # ── All images ───────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("ALL IMAGES  (src / data-src)")
    print("=" * 60)
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src") or img.get("data-lazy-src") or ""
        alt = img.get("alt", "")
        cls = " ".join(img.get("class", []))
        parent_cls = " ".join(img.parent.get("class", []))
        if src and "data:image" not in src:
            print(f"  src   : {src[:100]}")
            print(f"  alt   : {alt}")
            print(f"  class : {cls}  |  parent class: {parent_cls}")
            print()

    # ── Property detail links ─────────────────────────────────────────────────
    print("=" * 60)
    print("PROPERTY DETAIL LINKS  (/property-details/...)")
    print("=" * 60)
    seen = set()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "property-details" in href and href not in seen:
            seen.add(href)
            print(f"  {href}")

    # ── Potential card wrappers ───────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("DIVS THAT CONTAIN BOTH AN IMAGE AND A LINK  (candidate card wrappers)")
    print("=" * 60)
    for div in soup.find_all("div"):
        has_img  = div.find("img") is not None
        has_link = div.find("a", href=lambda h: h and "property-details" in h) is not None
        if has_img and has_link:
            cls = " ".join(div.get("class", []))
            if cls:
                print(f"  classes: {cls}")

    # ── Raw HTML of first property card ─────────────────────────────────────
    print("\n" + "=" * 60)
    print("RAW HTML — first div containing a property-details link")
    print("=" * 60)
    for div in soup.find_all("div"):
        link = div.find("a", href=lambda h: h and "property-details" in h)
        if link and div.find("img"):
            print(str(div)[:3000])
            break

    # ── Raw page text ─────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("RAW PAGE TEXT  (first 2000 chars)")
    print("=" * 60)
    body = soup.find("body")
    if body:
        print(" ".join(body.stripped_strings)[:2000])


if __name__ == "__main__":
    html = fetch_html(URL)
    audit(html)
