# UI snapshots

This folder stores complete UI snapshots that should remain available even as
the active frontend changes.

## frontend-ui-before-current-changes-e83d1fb-2026-09-18.tar.gz

- Source: `frontend/` from commit `e83d1fb3aa0d161be2c1ff5604eabda68e7d5b0a`
- Commit title: `chore: consolidate search-only repo structure`
- Commit date: `2026-09-17T20:04:27-05:00`
- Snapshot date: `2026-09-18`
- SHA-256: `18ddffbffbdceb83a135102ac057ff3ff5a9cb2a809160a36d11b98c7434d057`
- Purpose: preserve the previous committed UI before the current round of
  uncommitted UI changes.

To inspect it without touching the active app:

```bash
mkdir -p /tmp/uiuc-ui-snapshot
tar -xzf archive/ui-snapshots/frontend-ui-before-current-changes-e83d1fb-2026-09-18.tar.gz -C /tmp/uiuc-ui-snapshot
```
