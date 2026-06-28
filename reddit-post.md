# Reddit Post — r/UIUC

**Title:** My roommates stubbed out cigarettes in our shared drinking glasses. Anyway, I built an apartment finder for UIUC.

---

Two years ago I was apartment hunting from overseas before coming to UIUC.

I thought all the studios near campus were gone, so I signed a 4b4b figuring "eh, it's roughly the same price and closer to class."

Big mistake.

During the roommate search, everyone said they didn't smoke.

Then they moved in and started smoking inside the apartment.

At one point they were literally stubbing out cigarettes in our shared drinking glasses. lol

They also said no overnight guests.

A few days after move-in, we had a little house meeting and one roommate casually mentioned her boyfriend might stay "2 or 3 days."

He stayed for two weeks. yeah.

One night I got back at 11:20 PM and the party was still going — even though they'd genuinely promised it would end by 11.

Forty minutes later it finally stopped.

Then I got a message:

*"A guy passed out drunk on our couch. Could you grab him a blanket?"*

About a month in, I found a studio within walking distance that was well within my budget. Only about $100/month more than what I was paying.

The problem wasn't that affordable studios didn't exist. I just gave up too early and didn't have a good way to compare options.

---

Fast forward two years. I'm deep into UIUC CS now, and I figured I'd actually do something about this.

So I built **uiuc-housing-ai** — an apartment search tool specifically for UIUC students.

**The problem with apartment hunting here**

You end up with 15 tabs open — Green Street, University Group, MHM, Dean Campustown, 707, Hub, Smile, and a bunch of others — manually comparing rent, utilities, what's furnished, what's actually available.

Apartments.com listings are often stale too, showing units that are already gone.

So I wrote a scraper that pulls fresh listings regularly from the actual property management sites. Checked every site's robots.txt first.

**Things first-time renters often miss**

**Frat row and bar proximity.** You might love an apartment on paper, sign the lease, and then realize every nice-weather evening in fall and spring means an outdoor party right outside your window.

**Actual distance math.** Instead of vague "near campus" labels, the tool uses lat/lng to calculate real walking distances to your classes, grocery stores, whatever you care about.

**Views:** Card, Table, and Map — browse however makes sense to you.

---

Built this mostly for incoming students, especially international students hunting remotely without older friends to ask. Hopefully it saves someone from my particular situation.

Happy to answer questions about the tech stack, the scraping approach, or UIUC housing in general.

---

**TL;DR:** Nightmare 4b4b freshman year because I gave up apartment hunting too early. Built a tool so others can compare all UIUC listings in one place without opening 15 tabs.
