---
name: SharePoint video embedding
description: Why SharePoint videos block in iframes and how the app streams them instead
---
SharePoint refuses to play inside iframes on other sites: third-party cookie blocking breaks its sign-in, and "Anyone" links to raw files redirect through pages that deny framing. Opening in a new tab always works (first-party context).

**Why:** Users kept seeing the blocked icon in the learner course view despite "Anyone" share links.

**How to apply:** For in-page playback, stream "Anyone" share links (`/:v:/...`, direct file URLs) through the server proxy at `/api/sharepoint-video` into a native <video> tag. Only works for links set to "Anyone" — authenticated-only links must keep the embed.aspx iframe flow. Proxy must validate every redirect hop stays on *.sharepoint.com (SSRF).
