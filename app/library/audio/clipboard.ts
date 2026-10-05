"use client";

// COPY FOR A HUMAN TO PASTE — the manual half of every round trip to a vendor
// this studio cannot drive (Suno today). Was a private function of
// ./AudioWorkbench.tsx; lifted here, unchanged, when the Sound lab
// (app/playground) began composing Suno prompts too, so the two surfaces copy
// through one path and fail the same way.

/** The async clipboard first; the textarea route for a browser that refuses it
 *  (core.js#copy). Resolves false when both refuse — the caller keeps the draft
 *  and says the clipboard was blocked, never that it copied. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const t = document.createElement("textarea");
    t.value = text;
    document.body.appendChild(t);
    t.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    t.remove();
    return ok;
  }
}
