// THE ONE COPY ACT. Outside a secure context (plain http on a LAN address) `navigator.clipboard`
// is undefined, and a bare `navigator.clipboard.writeText(...)` throws a TypeError synchronously,
// past any `.then` rejection handler, so the click said nothing. Every copy site goes through
// here and gets an answer either way: it never throws and never rejects.

export type Copied = { readonly ok: true } | { readonly ok: false; readonly error: string };

export async function copyText(text: string): Promise<Copied> {
  const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  if (clipboard === undefined || typeof clipboard.writeText !== "function") {
    return { ok: false, error: "no clipboard here (it needs https or localhost)" };
  }
  try {
    await clipboard.writeText(text);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
