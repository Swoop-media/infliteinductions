---
name: Versioned read receipts
description: How unread state must behave when published content can later be republished.
---

Read receipts for republishable content must record the exact publication version the user viewed, not just the time they opened it. Counting and marking should operate on one database snapshot and only accept receipts that still match the current publication version.

**Why:** A republish can race between fetching content and writing a receipt. A plain `read_at` written after the republish can incorrectly make unseen content look read, while offset pagination can skip reordered publications.

**How to apply:** Compare an immutable publication identifier or publication timestamp for equality. Make stale marks no-ops, use an atomic snapshot for complete published sets, and ensure rerunning migrations never advances existing receipts to a newer publication.