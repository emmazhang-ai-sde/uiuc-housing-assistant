# Invite User Email Test

**Created: 2026-07-03**

## Purpose

Verify that the "Invite user" Supabase email template renders and sends correctly, using a personal address (sz94@illinois.edu) as the test recipient.

## Prerequisite check

Confirm custom SMTP is connected: Supabase Dashboard → Authentication → Emails → SMTP Settings. If a provider such as Resend is not connected, sends are capped by Supabase's default test-only sender and template edits may be locked (see `design-docs/user-authentication.md` sections 5.7.1 and 6.3).

## Template sanity check

Supabase Dashboard → Authentication → Emails → Templates → "Invite user" tab holds the template body. This tab is distinct from the "Magic Link" tab, which is used for the OTP login flow. Do not edit the wrong tab.

## Send steps

1. Supabase Dashboard → Authentication → Users.
2. Click "Invite user".
3. Enter `sz94@illinois.edu`.
4. Send.

## Verification

1. Check the sz94@illinois.edu inbox and spam folder for the invite email.
2. Confirm the subject and body render as expected.
3. Click through the invite link to confirm it works.

## Troubleshooting

If the email does not arrive, or arrives using Supabase's default template instead of the custom one, recheck the prerequisite check and template sanity check steps above before anything else.
