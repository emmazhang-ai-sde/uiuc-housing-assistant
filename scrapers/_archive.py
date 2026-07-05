# scrapers/_archive.py
# Shared save logic for the scrapers. Writes the canonical latest raw JSON plus a
# timestamped archive, and tags runs that failed to fully fetch/enrich as "_partial"
# so a later complete run can supersede (and auto-clean) them.
#
# Canonical is always overwritten with this run's result, complete or not. A partial
# run never fabricates data for what it couldn't fetch (see each scraper's own
# failure handling) — it's an honest, possibly-smaller-than-usual snapshot, and the
# next run (e.g. --retry-missing) needs to see it as-is to know what's still missing.
# Refusing to write it would instead leave canonical stuck on stale data and unable
# to make forward progress.
#
# The _partial suffix + same-day auto-cleanup below is what makes a multi-pass scrape
# session (an initial run followed by one or more retry passes) converge to exactly
# ONE archived file: each incomplete pass is archived as `_partial`, and once a later
# pass in the same session reports zero failures, that complete archive is kept and
# the earlier partials from that day are deleted.
# See design-docs/ai-pipeline-implementation-phases/phase-5.1-snapshot-versioning.md

import glob
import json
import os
from datetime import datetime

DATA_DIR    = "data"
ARCHIVE_DIR = "data/raw_archive"


def save_scrape(data: list[dict], slug: str, failed: int) -> None:
    """Persist one scrape run.

    data   — scraped listings for this company
    slug   — company file slug, e.g. "green_street"
    failed — number of properties this run failed to fetch/enrich (0 == complete run)
    """
    os.makedirs(ARCHIVE_DIR, exist_ok=True)

    complete = failed == 0
    stamp    = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    today    = stamp[:10]

    # Archive every run. Incomplete runs carry a _partial suffix so they're obvious
    # and can be cleaned up automatically once a complete run supersedes them.
    suffix       = "" if complete else "_partial"
    archive_path = f"{ARCHIVE_DIR}/{slug}_raw_{stamp}{suffix}.json"
    with open(archive_path, "w") as f:
        json.dump(data, f, indent=2)

    # Canonical latest raw (what pipeline/normalize.py reads, and what a later
    # --retry-missing pass reads to know what's already covered). Always overwritten.
    canonical = f"{DATA_DIR}/{slug}_raw.json"
    with open(canonical, "w") as f:
        json.dump(data, f, indent=2)

    # A complete run makes earlier same-day partial archives obsolete.
    removed = []
    if complete:
        for p in sorted(glob.glob(f"{ARCHIVE_DIR}/{slug}_raw_{today}_*_partial.json")):
            os.remove(p)
            removed.append(p)

    # ── Report ──
    unique_props = len(set(d["address"] for d in data))
    print(f"\n✅ Saved {len(data)} floor plan listings from {unique_props} properties")
    if complete:
        print(f"   → {archive_path}  (archived, complete)")
    else:
        plural = "y" if failed == 1 else "ies"
        print(f"   ⚠ {failed} propert{plural} missing this run — archived as PARTIAL:")
        print(f"   → {archive_path}")
        print("   Re-run (or --retry-missing) to fill the gap; this partial is auto-removed once a complete run succeeds.")
    print(f"   → {canonical}")
    for p in removed:
        print(f"   🧹 removed superseded partial: {p}")
