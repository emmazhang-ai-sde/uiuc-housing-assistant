"""
scripts/bulk_invite.py

Bulk-send Supabase "Invite user" emails to everyone on the waitlist who
doesn't already have an account. Uses the Admin API (service_role key),
which is the same endpoint the Dashboard's "Send Invitation" button hits
(POST /auth/v1/invite) — this just loops it.

Requires SUPABASE_SERVICE_ROLE_KEY in .env (Dashboard → Settings → API →
service_role secret). Never commit this key or log it.

Safety:
- Defaults to --dry-run: prints who would be invited, sends nothing.
- --test sends only to TEST_EMAILS, ignoring the waitlist, for a live check.
- --limit caps how many real invites are sent in one run (Resend free tier
  is 100/day per design-docs/user-authentication.md §5.7.1 — stay under that).
- Already-registered emails (found in auth.users) are skipped automatically;
  Supabase's invite endpoint would just error on them anyway.

Usage:
    source .venv/bin/activate
    python scripts/bulk_invite.py --dry-run                 # see who's pending, sends nothing
    python scripts/bulk_invite.py --test                     # live test on TEST_EMAILS only
    python scripts/bulk_invite.py --email someone@illinois.edu  # send to one specific address
    python scripts/bulk_invite.py --limit 100                 # real run, capped at 100 sends
"""

import argparse
import os
import time

import requests
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://uknyhpwzvdevxfxkpxmy.supabase.co")
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

DELAY_BETWEEN_SENDS = 1.0  # seconds, gentle on Supabase + Resend rate limits

TEST_EMAILS = [
    "shuyangzhang.cs@gmail.com",
    "shuyangzhang.life@gmail.com",
    "sz94@illinois.edu",
]


def _admin_headers() -> dict:
    if not SERVICE_ROLE_KEY:
        raise SystemExit(
            "Missing SUPABASE_SERVICE_ROLE_KEY in .env. "
            "Get it from Dashboard → Settings → API → service_role secret. "
            "Do not commit it."
        )
    return {
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }


def fetch_waitlist_emails() -> list[str]:
    res = requests.get(
        f"{SUPABASE_URL}/rest/v1/waitlist",
        params={"select": "email", "order": "created_at.asc"},
        headers=_admin_headers(),
        timeout=30,
    )
    res.raise_for_status()
    emails = {row["email"].strip().lower() for row in res.json()}
    return sorted(emails)


def fetch_existing_user_emails() -> set[str]:
    """Every email already in auth.users, paginated, so we don't re-invite them."""
    existing = set()
    page = 1
    while True:
        res = requests.get(
            f"{SUPABASE_URL}/auth/v1/admin/users",
            params={"page": page, "per_page": 1000},
            headers=_admin_headers(),
            timeout=30,
        )
        res.raise_for_status()
        users = res.json().get("users", [])
        if not users:
            break
        existing.update(u["email"].strip().lower() for u in users if u.get("email"))
        if len(users) < 1000:
            break
        page += 1
    return existing


def send_invite(email: str) -> tuple[bool, str]:
    res = requests.post(
        f"{SUPABASE_URL}/auth/v1/invite",
        json={"email": email},
        headers=_admin_headers(),
        timeout=30,
    )
    if res.ok:
        return True, "sent"
    return False, f"{res.status_code} {res.text[:200]}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="List pending invitees, send nothing")
    parser.add_argument("--test", action="store_true", help="Send only to TEST_EMAILS (live)")
    parser.add_argument("--email", help="Send to this one address only (live), ignoring the waitlist")
    parser.add_argument("--limit", type=int, default=100, help="Max real invites to send this run")
    args = parser.parse_args()

    if args.email:
        targets = [args.email.strip().lower()]
    elif args.test:
        targets = TEST_EMAILS
    else:
        waitlist = fetch_waitlist_emails()
        existing = fetch_existing_user_emails()
        targets = [e for e in waitlist if e not in existing]
        print(f"Waitlist: {len(waitlist)} unique emails")
        print(f"Already registered (skipped): {len(waitlist) - len(targets)}")
        print(f"Pending invite: {len(targets)}")

    if args.dry_run:
        print("\n--dry-run: sending nothing. Pending invitees:")
        for e in targets:
            print(f"  {e}")
        return

    targets = targets[: args.limit]
    print(f"\nSending {len(targets)} invite(s)...")

    sent, failed = 0, []
    for i, email in enumerate(targets, 1):
        ok, detail = send_invite(email)
        status = "OK" if ok else "FAIL"
        print(f"[{i}/{len(targets)}] {email} -> {status} ({detail})")
        if ok:
            sent += 1
        else:
            failed.append((email, detail))
        time.sleep(DELAY_BETWEEN_SENDS)

    print(f"\nDone. Sent {sent}/{len(targets)}.")
    if failed:
        print(f"Failed ({len(failed)}):")
        for email, detail in failed:
            print(f"  {email}: {detail}")


if __name__ == "__main__":
    main()
