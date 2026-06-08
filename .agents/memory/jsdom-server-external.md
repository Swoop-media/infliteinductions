---
name: jsdom must stay server-external
description: Why isomorphic-dompurify/jsdom must be in serverExternalPackages or the production build fails
---

# jsdom / isomorphic-dompurify must be in serverExternalPackages

`next.config.ts` must keep `serverExternalPackages: ["isomorphic-dompurify", "jsdom"]`.

**Why:** `isomorphic-dompurify` pulls in `jsdom` on the server. jsdom loads its own asset
files (e.g. `default-stylesheet.css`) via relative `fs` reads at runtime. If Next bundles
jsdom into `.next/server`, those relative paths no longer resolve and the production build
dies during "Collecting page data" with:
`ENOENT ... .next/server/app/.../default-stylesheet.css`. `next build` ignores TS/ESLint
errors (both ignore flags are on), so this surfaces only as a prerender/page-data failure,
not a type error. Dev server does not hit it the same way — it only breaks `next build`.

**How to apply:** Any server component/page importing `isomorphic-dompurify` (e.g. the
learner course page) relies on this. Don't remove these from `serverExternalPackages`, and
add any other native/asset-reading node package (sharp-like, canvas, etc.) the same way if a
build fails with a similar ENOENT-for-bundled-asset error.
