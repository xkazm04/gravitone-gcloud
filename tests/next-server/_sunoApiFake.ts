// A FAKE SUNO for lib/suno/api: the two metadata documents, registration, the token endpoint with
// rotating refresh tokens, revocation, and whatever REST answers a test installs. No network.

export const BASE = "https://api.suno.test";
export const AS = "https://as.suno.test/api/v2/external/oauth";

export interface Call {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string;
}

export interface FakeSuno {
  readonly fetch: typeof fetch;
  readonly calls: Call[];
  /** Token-endpoint calls by grant_type. */
  grants(type: string): URLSearchParams[];
  /** Install a REST answer for `METHOD /path` (path without the base, query included). */
  rest(key: string, answer: (c: Call) => Response | Promise<Response>): void;
  /** The refresh token the server currently honours; spending any other is invalid_grant. */
  live: { refresh: string; access: string; n: number; rotate: boolean; delayMs: number };
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

export function fakeSuno(): FakeSuno {
  const calls: Call[] = [];
  const rest = new Map<string, (c: Call) => Response | Promise<Response>>();
  const live = { refresh: "rt-0", access: "at-0", n: 0, rotate: true, delayMs: 0 };
  const f = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((v, k) => (headers[k] = v));
    const call: Call = { url, method: init.method ?? "GET", headers, body: typeof init.body === "string" ? init.body : "" };
    calls.push(call);
    if (url === `${BASE}/.well-known/oauth-protected-resource`) return json({ authorization_servers: [AS], resource: BASE, scopes_supported: ["api:v0"] });
    if (url === `${AS}/.well-known/oauth-authorization-server`)
      return json({
        issuer: AS,
        authorization_endpoint: `${AS}/authorize/`,
        token_endpoint: `${AS}/token/`,
        revocation_endpoint: `${AS}/revoke_token/`,
        registration_endpoint: `${AS}/register/`,
        code_challenge_methods_supported: ["S256"],
      });
    if (url === `${AS}/register/`) return json({ client_id: `client-${calls.length}`, redirect_uris: JSON.parse(call.body).redirect_uris }, 201);
    if (url === `${AS}/revoke_token/`) return new Response(null, { status: 200 });
    if (url === `${AS}/token/`) {
      const p = new URLSearchParams(call.body);
      if (live.delayMs) await new Promise((r) => setTimeout(r, live.delayMs));
      if (p.get("grant_type") === "authorization_code") {
        if (p.get("code") !== "good-code") return json({ error: "invalid_grant", error_description: "Invalid authorization code." }, 400);
        live.n++;
        live.access = `at-${live.n}`;
        live.refresh = `rt-${live.n}`;
        return json({ access_token: live.access, token_type: "Bearer", expires_in: 3600, refresh_token: live.refresh, scope: "api:v0 offline_access" });
      }
      if (p.get("grant_type") === "refresh_token") {
        if (p.get("refresh_token") !== live.refresh) return json({ error: "invalid_grant", error_description: "Refresh token has been used." }, 400);
        live.n++;
        live.access = `at-${live.n}`;
        if (!live.rotate) return json({ access_token: live.access, expires_in: 3600 });
        live.refresh = `rt-${live.n}`;
        return json({ access_token: live.access, expires_in: 3600, refresh_token: live.refresh });
      }
      return json({ error: "unsupported_grant_type" }, 400);
    }
    if (url.startsWith(BASE)) {
      const key = `${call.method} ${url.slice(BASE.length)}`;
      const answer = rest.get(key);
      if (!answer) return json({ error: "not found", code: "not_found" }, 404);
      return answer(call);
    }
    throw new TypeError(`fake suno: no route for ${url}`);
  };
  return {
    fetch: f as typeof fetch,
    calls,
    grants: (type) => calls.filter((c) => c.url === `${AS}/token/`).map((c) => new URLSearchParams(c.body)).filter((p) => p.get("grant_type") === type),
    rest: (key, answer) => void rest.set(key, answer),
    live,
  };
}
