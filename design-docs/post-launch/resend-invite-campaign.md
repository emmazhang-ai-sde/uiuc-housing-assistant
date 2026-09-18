# Resend Invite Email Campaign

**Created: 2026-07-09**

## Purpose

How the ~100-person waitlist gets sent Supabase's account-creating "Invite user" email over Resend custom SMTP, using `scripts/bulk_invite.py`, written down so the setup doesn't have to be re-derived for the next batch.

## 1. One-time setup: Resend + Supabase custom SMTP

The full walkthrough already lives in `design-docs/user-authentication.md` §6.3, this is the short version:

1. Create a Resend account and verify a sending subdomain (`send.uiuc-housing-ai.com`) by adding the DNS records Resend generates (MX, an SPF `TXT`, a DKIM `TXT`).
2. Resend → API Keys → create a Sending key (`re_...`).
3. Supabase Dashboard → Authentication → Emails → SMTP Settings → enable Custom SMTP: host `smtp.resend.com`, port `465`, username `resend`, password the `re_...` key, sender `noreply@send.uiuc-housing-ai.com`.
4. Saving this unlocks template editing and lifts the tiny rate limit Supabase's default sender is capped at.

Free Resend tier is 100 emails/day, 3,000/month, which comfortably covers the current waitlist size. See `user-authentication.md` §5.7.1 for the growth math and the point at which it's worth swapping to SendPulse (no app code change, just new SMTP credentials).

## 2. Sending the actual invites: `scripts/bulk_invite.py`

Added in commit `a3f4bc1` ("feat: admin account panel + waitlist invite tooling; refresh README", 2026-07-06). It calls Supabase's Admin API (`POST /auth/v1/invite`) once per pending email, the same endpoint the Dashboard's "Send Invitation" button hits, authenticated with `SUPABASE_SERVICE_ROLE_KEY`.

Built-in safety rails:

- Defaults to `--dry-run`: prints who would be invited, sends nothing.
- `--test` sends only to the 3 founder/test addresses, for a live smoke test before touching real users.
- Emails already in `auth.users` are skipped automatically, Supabase's invite endpoint would just error on them.
- `--limit` caps how many real invites go out in one run, to stay under Resend's 100/day free-tier ceiling.

```bash
source .venv/bin/activate
python scripts/bulk_invite.py --dry-run                    # see who's pending, sends nothing
python scripts/bulk_invite.py --test                        # live test, founder/test emails only
python scripts/bulk_invite.py --email someone@illinois.edu  # send to one specific address
python scripts/bulk_invite.py --limit 100                   # real run, capped at 100 sends
```

## 3. Recommended order of operations for the next batch

1. Confirm custom SMTP is still connected (Supabase Dashboard → Authentication → Emails → SMTP Settings). `design-docs/product-launch/invite-user-email-test.md` has the manual single-send sanity check if something looks off.
2. `python scripts/bulk_invite.py --dry-run`, eyeball the pending list.
3. `python scripts/bulk_invite.py --test`, confirm the invite email lands correctly (subject, body, working link) in your own inbox and spam folder.
4. `python scripts/bulk_invite.py --limit <N>`, the real send, `N` kept under the 100/day ceiling.
5. Spot check a few recipients directly: does the invite link log them in, does the account show up in `auth.users`.

## 4. Not to be confused with the mail-merge notify email

`design-docs/product-launch/waitlist-launch-mail-merge.md` documents a different, earlier campaign: an Outlook Mail Merge "we're live" notification sent to existing waitlist signups. That one doesn't create an account or use Resend/Supabase at all, it's a plain notify email through the founder's UIUC Outlook. This doc is specifically about the Supabase "Invite user" flow, which does create the account and log the person in via a magic link.

## 5. Related docs

- `design-docs/user-authentication.md` §5.7.1, §6.3: why Resend was chosen, full DNS/SMTP setup steps.
- `design-docs/product-launch/invite-user-email-test.md`: manual single-send test via the Supabase dashboard, no script involved.
- `design-docs/product-launch/waitlist-launch-mail-merge.md`: the separate Outlook Mail Merge notify-only campaign.
- `design-docs/post-launch/active-pending-users.md`: how to pull the current list of waitlist emails who still need an invite.
