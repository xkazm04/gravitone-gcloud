// DOES THE KEY WORK - one free, read-only call per vendor key, for a preflight that must say "this
// key is refused" before a night spends its first unit on finding out (2026-10-22: a 14-character
// placeholder in GOOGLE_AI_API_KEY was "set", and the live rehearsal's first extract tripped its
// breaker on three 400s). Google: the model list; Leonardo: the account. Nothing is generated.
//
// The key goes in a header, never a URL, and never into what this returns: a vendor that quotes the
// key back has it redacted, the way providers/leonardoFlare.ts does.

export type KeyFetch = (url: string, init: { readonly method: string; readonly headers: Record<string, string>; readonly signal?: AbortSignal }) => Promise<{ readonly ok: boolean; readonly status: number; text(): Promise<string> }>;

export type KeyProbe = { readonly ok: true; readonly found: string } | { readonly ok: false; readonly found: string };

const redact = (text: string, key: string): string => (key === "" ? text : text.split(key).join("[redacted]"));

/** The vendor's own sentence from an error body, else the status. */
function sentence(body: string, status: number): string {
  try {
    const j = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    const m = typeof j.error === "string" ? j.error : (j.error?.message ?? j.message);
    if (typeof m === "string" && m.trim() !== "") return `${status}: ${m.trim()}`;
  } catch {
    // not JSON: the status says it
  }
  return `HTTP ${status}`;
}

/** One read-only GET with the key in a header; `okWord` reads an accepted body (studio/balance.ts reads the API pool with it). */
export async function probeWith(fetchFn: KeyFetch, url: string, headers: Record<string, string>, key: string, okWord: (body: string) => string): Promise<KeyProbe> {
  try {
    const res = await fetchFn(url, { method: "GET", headers, signal: AbortSignal.timeout(15_000) });
    const body = await res.text();
    if (!res.ok) return { ok: false, found: redact(sentence(body, res.status), key) };
    return { ok: true, found: okWord(body) };
  } catch (e) {
    return { ok: false, found: redact(`unreachable: ${(e as Error).message}`, key) };
  }
}

/** GOOGLE_AI_API_KEY against the Gemini model list. */
export function probeGoogle(key: string, fetchFn: KeyFetch = fetch as unknown as KeyFetch): Promise<KeyProbe> {
  return probeWith(fetchFn, "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", { "x-goog-api-key": key }, key, () => "accepted (model list)");
}

/** LEONARDO_API_KEY against the account it belongs to. */
export function probeLeonardo(key: string, fetchFn: KeyFetch = fetch as unknown as KeyFetch): Promise<KeyProbe> {
  return probeWith(fetchFn, "https://cloud.leonardo.ai/api/rest/v1/me", { authorization: `Bearer ${key}`, accept: "application/json" }, key, (body) => {
    try {
      const u = (JSON.parse(body) as { user_details?: Record<string, unknown>[] }).user_details?.[0] ?? {};
      const credits = Object.entries(u)
        .filter(([k, v]) => /tokens$/i.test(k) && typeof v === "number")
        .reduce((n, [, v]) => n + (v as number), 0);
      return `accepted · ${credits} credits on the account`;
    } catch {
      return "accepted";
    }
  });
}
