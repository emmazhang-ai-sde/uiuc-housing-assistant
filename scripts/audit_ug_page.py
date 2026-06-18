"""
Audit script — Universities Group detail page structure.

Fetches ONE property page via Playwright and prints:
  - All <img> src attributes (for photo discovery)
  - All label/value pairs found in the unit tab blocks
  - Any <li> or <p> text outside the tab blocks (amenities, descriptions, etc.)
  - Raw section headings

Run:
    python scripts/audit_ug_page.py
    python scripts/audit_ug_page.py <url>   # override the target URL
"""

import sys
import time
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

URL = (
    sys.argv[1]
    if len(sys.argv) > 1
    else "https://ugroupcu.com/property-details/302-310-s-1st-midtown-plaza-champaign/"
)

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
        page.goto(url, wait_until="domcontentloaded", timeout=25000)
        time.sleep(3)

        html = page.content()
        browser.close()
    return html


def audit(html: str) -> None:
    soup = BeautifulSoup(html, "html.parser")

    # ── Address ──────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("ADDRESS")
    print("=" * 60)
    h3 = soup.find("h3")
    print(h3.get_text(strip=True) if h3 else "(not found)")

    # ── All images ───────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("IMAGES  (src attributes)")
    print("=" * 60)
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src") or ""
        alt = img.get("alt", "")
        if src and "data:image" not in src:
            print(f"  src={src}")
            if alt:
                print(f"       alt={alt}")

    # ── Section headings ─────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("HEADINGS  (h1–h4)")
    print("=" * 60)
    for tag in soup.find_all(["h1", "h2", "h3", "h4"]):
        text = tag.get_text(strip=True)
        if text:
            print(f"  <{tag.name}> {text}")

    # ── Unit tab blocks — every label/value pair ─────────────────────────────
    print("\n" + "=" * 60)
    print("UNIT TAB BLOCKS  (div.tab-content_in_wrapp)")
    print("=" * 60)
    for unit in soup.find_all("div", class_="tab-content_in_wrapp"):
        h4 = unit.find("h4", class_="propert_head")
        print(f"\n  Unit type: {h4.get_text(strip=True) if h4 else '(unnamed)'}")
        rgt = unit.find("div", class_="tab-content_in_rgt")
        if rgt:
            for li in rgt.find_all("li"):
                divs = li.find_all("div")
                if len(divs) >= 2:
                    label = divs[0].get_text(strip=True)
                    value = divs[1].get_text(strip=True)
                    print(f"    {label:30s} {value}")
                else:
                    text = li.get_text(strip=True)
                    if text:
                        print(f"    (bare li) {text}")

    # ── Text blocks outside unit tabs ────────────────────────────────────────
    print("\n" + "=" * 60)
    print("OTHER TEXT BLOCKS  (<p> and <li> outside tab blocks)")
    print("=" * 60)
    tab_wrappers = soup.find_all("div", class_="tab-content_in_wrapp")
    tab_texts = set()
    for w in tab_wrappers:
        tab_texts.update(t.strip() for t in w.stripped_strings)

    for el in soup.find_all(["p", "li"]):
        text = el.get_text(strip=True)
        if text and text not in tab_texts and len(text) > 5:
            parent_classes = " ".join(el.parent.get("class", []))
            print(f"  [{el.name} | parent={parent_classes}]  {text[:120]}")

    # ── Full page text (last resort) ─────────────────────────────────────────
    print("\n" + "=" * 60)
    print("RAW PAGE TEXT  (first 3000 chars, whitespace-collapsed)")
    print("=" * 60)
    body = soup.find("body")
    if body:
        raw = " ".join(body.stripped_strings)
        print(raw[:3000])


if __name__ == "__main__":
    html = fetch_html(URL)
    audit(html)
