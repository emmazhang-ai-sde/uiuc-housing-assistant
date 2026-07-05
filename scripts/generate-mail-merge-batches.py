"""
Fetch the Supabase `waitlist` table, dedupe by email, and write
email-batches.md: a copy-paste-ready list split into 4 batches of 15,
plus a separate test batch of personal addresses for a dry run.

Local-only utility. Output goes to scripts/mail-merge-batches/, which is
gitignored (contains real student emails). Do not commit or share.

Usage:
    source .venv/bin/activate
    python scripts/generate-mail-merge-batches.py
"""

import os
import requests
import pandas as pd

SUPABASE_URL = "https://uknyhpwzvdevxfxkpxmy.supabase.co"
SUPABASE_ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6"
    "InVrbnlocHd6dmRldnhmeGtweG15Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MjQ4"
    "NzEsImV4cCI6MjA5NzQwMDg3MX0.H7KEmNyorxbc_JGVSdVNAWwBqtax225uBvsoPdrmKdk"
)
BATCH_SIZE = 15
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "mail-merge-batches")
OUTPUT_MD = os.path.join(OUTPUT_DIR, "email-batches.md")

# Personal addresses to dry-run the send on before touching the real waitlist.
# Not pulled from Supabase.
TEST_EMAILS = [
    "shuyangzhang.cs@gmail.com",
    "shuyangzhang.life@gmail.com",
    "sz94@illinois.edu",
]


def fetch_waitlist() -> pd.DataFrame:
    res = requests.get(
        f"{SUPABASE_URL}/rest/v1/waitlist",
        params={"select": "email,created_at", "order": "created_at.asc"},
        headers={
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        },
        timeout=30,
    )
    res.raise_for_status()
    return pd.DataFrame(res.json())


def main():
    df = fetch_waitlist()
    total_raw = len(df)

    df["email"] = df["email"].str.strip().str.lower()
    df = df.drop_duplicates(subset="email", keep="first").reset_index(drop=True)
    duplicates_removed = total_raw - len(df)
    emails = df["email"].tolist()

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    lines = ["# Waitlist Email Batches", "", "Paste the batch line into Bcc, put your own address in To.", ""]

    lines += ["## Test batch (3)", "", "; ".join(TEST_EMAILS), ""]

    num_batches = (len(emails) + BATCH_SIZE - 1) // BATCH_SIZE
    for i in range(num_batches):
        chunk = emails[i * BATCH_SIZE : (i + 1) * BATCH_SIZE]
        lines += [f"## Batch {i + 1} ({len(chunk)})", "", "; ".join(chunk), ""]

    with open(OUTPUT_MD, "w") as f:
        f.write("\n".join(lines))

    print(f"Wrote {OUTPUT_MD}")
    print(f"Total signups fetched: {total_raw}")
    print(f"Duplicate emails removed: {duplicates_removed}")
    print(f"Unique recipients: {len(emails)}")
    print(f"Batches written: {num_batches} (max {BATCH_SIZE} per batch)")


if __name__ == "__main__":
    main()
