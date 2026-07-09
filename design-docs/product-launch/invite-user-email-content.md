# Supabase Invite User Email — Content Versions

**Created: 2026-07-09**

Archived subject/body content for the Supabase Auth "Invite user" email template (Dashboard → Authentication → Emails → Templates → "Invite user" tab, per `invite-user-email-test.md`). This is the email sent to waitlisted users inviting them to log in now that the site is live. Recorded here so past versions aren't lost as the copy gets revised — append a new dated section below for each future version rather than overwriting this one.

---

## v1 — 2026-07-09 (launch invite)

**Subject:** UIUC Housing AI Project is now live!

**Body:**

```html
<!DOCTYPE html>
<html lang="en">
  <body
    style="
      margin: 0;
      padding: 0;
      background: #fff7ed;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
        Helvetica, Arial, sans-serif;
      color: #1f2937;
    "
  >
    <table
      role="presentation"
      width="100%"
      cellpadding="0"
      cellspacing="0"
      style="padding: 32px 16px;"
    >
      <tr>
        <td align="center">
          <table
            role="presentation"
            width="100%"
            cellpadding="0"
            cellspacing="0"
            style="
              max-width: 560px;
              background: #ffffff;
              border-radius: 20px;
              overflow: hidden;
            "
          >
            <tr>
              <td
                style="
                  padding: 34px 40px 26px;
                  background: #ffffff;
                  text-align: center;
                "
              >
                <p
                  style="
                    margin: 0 0 10px;
                    font-size: 13px;
                    line-height: 1.4;
                    font-weight: 800;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    color: #ff5f05;
                  "
                >
                  Now Live
                </p>

                <p
                  style="
                    margin: 0;
                    font-size: 24px;
                    line-height: 1.35;
                    font-weight: 800;
                    color: #111827;
                  "
                >
                  Housing AI Project has launched!
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding: 38px 40px 24px;">
                <p
                  style="
                    margin: 0 0 18px;
                    font-size: 16px;
                    line-height: 1.7;
                    color: #374151;
                  "
                >
                  Hi,
                </p>

                <p
                  style="
                    margin: 0 0 18px;
                    font-size: 16px;
                    line-height: 1.7;
                    color: #374151;
                  "
                >
                  Thank you for joining the Housing AI Project waitlist.
                </p>

                <p
                  style="
                    margin: 8px 0 12px;
                    font-size: 18px;
                    line-height: 1.65;
                    font-weight: 800;
                    color: #13294b;
                    text-align: center;
                  "
                >
                  The website has already launched.
                </p>

                <p
                  style="
                    margin: 0 0 8px;
                    font-size: 15px;
                    line-height: 1.7;
                    color: #4b5563;
                    text-align: center;
                  "
                >
                  You can now log in and try it out.
                </p>

                <p
                  style="
                    margin: 0 0 24px;
                    font-size: 15px;
                    line-height: 1.7;
                    color: #4b5563;
                    text-align: center;
                  "
                >
                  We are excited to finally share it with you.
                </p>

                <p
                  style="
                    margin: 0 0 24px;
                    font-size: 16px;
                    line-height: 1.7;
                    color: #374151;
                  "
                >
                  Housing AI Project brings apartment listings from multiple
                  leasing companies into one place, so students can search and
                  compare housing more easily.
                </p>

                <table
                  role="presentation"
                  cellpadding="0"
                  cellspacing="0"
                  style="margin: 0 0 28px;"
                >
                  <tr>
                    <td
                      style="
                        background: #ff5f05;
                        border-radius: 999px;
                      "
                    >
                      <a
                        href="{{ .ConfirmationURL }}"
                        style="
                          display: inline-block;
                          padding: 12px 22px;
                          font-size: 15px;
                          line-height: 1.4;
                          font-weight: 700;
                          color: #ffffff;
                          text-decoration: none;
                        "
                      >
                        Log in and try it out
                      </a>
                    </td>
                  </tr>
                </table>

                <p
                  style="
                    margin: 0 0 18px;
                    font-size: 14px;
                    line-height: 1.7;
                    color: #6b7280;
                  "
                >
                  Housing AI Project is an independent student-built project and
                  is not affiliated with or endorsed by the University of
                  Illinois.
                </p>

                <p
                  style="
                    margin: 0;
                    font-size: 16px;
                    line-height: 1.7;
                    font-weight: 700;
                    color: #13294b;
                  "
                >
                  Housing AI Project
                </p>
              </td>
            </tr>

            <tr>
              <td
                style="
                  padding: 0 40px 32px;
                  text-align: center;
                  background: #ffffff;
                "
              >
                <p
                  style="
                    margin: 0;
                    font-size: 12px;
                    line-height: 1.6;
                    color: #9ca3af;
                    font-style: italic;
                  "
                >
                  You are receiving this email because you joined the project
                  waitlist.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```
