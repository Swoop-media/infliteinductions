---
name: Deployment package manager (pnpm)
description: This repo is pnpm-managed; a stray package-lock.json breaks Replit deployment installs.
---

# Deployment must install with pnpm

This project is pnpm-managed: `pnpm-lock.yaml` is the source of truth and
`node_modules/.pnpm` is the on-disk layout. `package.json` declares
`"packageManager": "pnpm@<version>"`.

**Rule:** Do not let a `package-lock.json` (or `yarn.lock`) exist in the repo.

**Why:** Replit deployment picks its installer from the lockfiles present. When
both `package-lock.json` and `pnpm-lock.yaml` exist, it ran `npm install`, which
chokes on the pnpm-structured tree — symptoms in the deploy/install log:
`shrinkwrap failed ... node_modules/.pnpm/<pkg>` followed by npm's
`Exit handler never called!` and `exit status 1`. The deployment fails at the
INSTALL step, before `npm run build` ever runs (so build-time fixes like
next.config serverExternalPackages are unrelated to that failure).

**How to apply:** Keep only `pnpm-lock.yaml`. Verify sync with
`pnpm install --frozen-lockfile` (expect exit 0). If a `package-lock.json`
reappears (e.g. someone ran `npm install`), delete it. The `packageManager`
field makes installer detection deterministic.
