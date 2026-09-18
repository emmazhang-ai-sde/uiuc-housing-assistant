"""
scripts/list_email_segments.py

Splits the waitlist into two segments for the resend campaign:
  1. Active    - emails with at least one row in events_with_email
                 (they've actually logged in / used the chat, map, etc.)
  2. Pending   - on the waitlist, registered or not, but never logged an
                 event (received the initial invite, haven't used it yet)

Founder/test emails (ADMIN_EMAIL) are excluded from both lists, same as the
/admin/activity dashboard. Uses the service_role key (read-only queries).

Usage:
    source .venv/bin/activate
    python scripts/list_email_segments.py
    python scripts/list_email_segments.py --out scripts/mail-merge-batches
"""

import argparse
import os
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()
load_dotenv(Path(__file__).resolve().parent.parent / "frontend" / ".env.local")

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
ADMIN_EMAILS = {
    e.strip().lower()
    for e in os.environ.get("ADMIN_EMAIL", "").split(",")
    if e.strip()
}


def _headers() -> dict:
    if not SUPABASE_URL or not SERVICE_ROLE_KEY:
        raise SystemExit(
            "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. "
            "Check frontend/.env.local."
        )
    return {
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }


def fetch_waitlist_emails() -> set[str]:
    res = requests.get(
        f"{SUPABASE_URL}/rest/v1/waitlist",
        params={"select": "email"},
        headers=_headers(),
        timeout=30,
    )
    res.raise_for_status()
    return {row["email"].strip().lower() for row in res.json()}


def fetch_active_emails() -> set[str]:
    """Distinct emails with >=1 row in events_with_email (service_role only)."""
    res = requests.get(
        f"{SUPABASE_URL}/rest/v1/events_with_email",
        params={"select": "email"},
        headers=_headers(),
        timeout=30,
    )
    res.raise_for_status()
    return {row["email"].strip().lower() for row in res.json() if row.get("email")}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", help="Directory to write active.txt / pending.txt into")
    args = parser.parse_args()

    waitlist = fetch_waitlist_emails()
    active_all = fetch_active_emails()

    active = sorted(active_all - ADMIN_EMAILS)
    pending = sorted((waitlist - active_all) - ADMIN_EMAILS)

    print(f"Waitlist total: {len(waitlist)} (excluding {len(ADMIN_EMAILS)} founder/test emails)")
    print(f"\n=== 1. Active users ({len(active)}) - already used the service ===")
    for e in active:
        print(f"  {e}")

    print(f"\n=== 2. Pending users ({len(pending)}) - on waitlist, haven't used it yet ===")
    for e in pending:
        print(f"  {e}")

    if args.out:
        out_dir = Path(args.out)
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "active.txt").write_text("\n".join(active) + "\n")
        (out_dir / "pending.txt").write_text("\n".join(pending) + "\n")
        print(f"\nWrote {out_dir / 'active.txt'} and {out_dir / 'pending.txt'}")


if __name__ == "__main__":
    main()
