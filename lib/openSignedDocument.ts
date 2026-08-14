"use client";

export type OpenSignedDocumentResult =
  | { ok: true }
  | { ok: false; blocked: boolean; message: string; url?: string };

/**
 * Popup-blocker-safe "fetch a signed URL then open it" flow.
 *
 * Desktop popup blockers treat window.open() calls made after an async gap
 * as non-user-initiated and silently block them. To survive that, we open a
 * blank tab synchronously during the click, then navigate it to the signed
 * URL once the fetch resolves. If the fetch fails we close the placeholder
 * tab and return an error; if the tab could not be opened at all we return
 * the URL so the caller can render a clickable fallback link.
 *
 * Must be called synchronously from a user-gesture handler (e.g. onClick).
 */
export async function openSignedDocument(
  getSignedUrl: () => Promise<string>
): Promise<OpenSignedDocumentResult> {
  // Open the tab synchronously, before any await, so the browser attributes
  // it to the user's click.
  let placeholder: Window | null = null;
  try {
    placeholder = window.open("about:blank", "_blank");
  } catch {
    placeholder = null;
  }

  if (placeholder) {
    try {
      placeholder.document.write(
        '<html><head><title>Opening document…</title></head>' +
          '<body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#555">' +
          "<p>Opening document…</p></body></html>"
      );
    } catch {
      // Non-fatal; the tab will still navigate.
    }
  }

  let url: string;
  try {
    url = await getSignedUrl();
  } catch (err) {
    if (placeholder) {
      try {
        placeholder.close();
      } catch {
        // ignore
      }
    }
    return {
      ok: false,
      blocked: false,
      message:
        err instanceof Error && err.message
          ? err.message
          : "Failed to open document. Please try again.",
    };
  }

  if (placeholder && !placeholder.closed) {
    placeholder.location.href = url;
    return { ok: true };
  }

  // The placeholder was blocked (or closed by the user). Try once more —
  // some browsers allow this — and otherwise hand back the URL for a
  // visible fallback link.
  let retry: Window | null = null;
  try {
    retry = window.open(url, "_blank", "noopener");
  } catch {
    retry = null;
  }
  if (retry) {
    return { ok: true };
  }

  return {
    ok: false,
    blocked: true,
    url,
    message:
      "Your browser blocked opening the document in a new tab. Use the link below to open it.",
  };
}
