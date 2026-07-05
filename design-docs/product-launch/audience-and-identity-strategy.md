# Audience & Identity Strategy

**Created: 2026-07-03**

## Summary

This is a strategy decision about two related but separate things: which email address system messages are sent *from* over time, and who is *allowed to sign up*. It changes the account-model assumption behind the currently shipped waitlist gate (see "Relation to existing docs" below).

## Phase 1 (now, 0-to-1): founder identity

The first outreach to the waitlist, the welcome email, is sent from the founder's personal school email, not a product domain address. At this stage the founder's own identity carries more trust and a stronger sense of belonging than a faceless company address would. This is worth doing even though it does not scale.

This is also why the waitlist itself was restricted to `@illinois.edu` in the first place. While collecting signups, launch posts were tagged and posted on Xiaohongshu and in the r/UIUC community on Reddit, both UIUC-specific audiences. Requiring an Illinois email matched that targeting and reinforced the sense of belonging to a UIUC-only early community.

## Phase 2 (post-launch, 1-to-10): product domain

Once the product is live, system emails (auth codes, invites, notifications) move to a product domain sender, for example `hello@uiuc-housing-ai.com`. This is already the direction of the existing Resend/custom-SMTP setup (`design-docs/user-authentication.md` D5, section 6.3) and the beta invite flow (`design-docs/product-launch/product-launch.md` section 1.5.5). Phase 2 does not require new decisions, it is the natural endpoint of what is already planned; this doc just states the timeline explicitly: personal address first, product domain address once live.

At the same time, the public launch is when the login page itself opens up: it changes from Illinois-email-only to accepting other email providers. Gmail is the preferred addition first; others such as Outlook may be added later, to be decided when that phase actually starts.

## Account model: open signup, UIUC email as a badge

From day one, the account system should accept any email address for signup. UIUC affiliation stops being a registration gate and becomes an identity/verification signal instead, for example a "verified UIUC student" badge shown on the profile, rather than a requirement to create an account at all.

**Why:** gating registration by school email caps the addressable audience at UIUC and blocks anyone helping a UIUC student search (parents, roommates from other schools, etc.). Keeping the UIUC affiliation as a verified badge preserves the "built for UIUC, by someone who gets it" belonging value without hard-capping who can use the product.

Users who sign in with a UIUC email will definitely get this badge in the UI, giving them a visible sense of pride and belonging distinct from non-UIUC users.

## Relation to existing docs

This changes an assumption in the currently shipped design, not just future work:

- `design-docs/user-authentication.md` D1 (section 5.1) ships a hard server-side lock: the `restrict_signup_to_waitlist` Auth Hook plus the `is_email_on_waitlist` RPC block account creation for any email not on the `waitlist` table, and per D3 the waitlist has so far only ever held `@illinois.edu` addresses. That is a registration gate by school affiliation, which this doc's account model supersedes.
- `design-docs/product-launch.md` section 1.5.5's beta invite flow (pick testers from the waitlist, invite via Supabase) still applies as-is during beta; it is a curation step, not the long-term signup gate.

**Not yet implemented.** This doc records the decision only. Loosening the Auth Hook/RPC gate into a non-blocking check, and building the "verified UIUC student" badge (likely via `.edu` email verification at any point after signup, not at signup), are separate follow-up implementation work.
