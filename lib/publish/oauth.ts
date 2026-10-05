// GOOGLE OAUTH, REFRESH-TOKEN ONLY — the token provider the YouTube client
// spends in live mode. Server-only.
//
// PORTED FROM StatReel packages/publish/src/oauth.ts, and NARROWED. StatReel
// ran the whole installed-app dance (loopback redirect on 127.0.0.1, PKCE,
// tokens persisted in the OS keychain through an injected SecretStore). This
// repo has no keychain seam and no desktop shell to open a browser from, and
// the brief says so: "no keychain". So the consent step happens ONCE, outside
// the app, and its product — a refresh token — is handed in through the
// environment like every other vendor credential here (.env.example carries
// the how). What survives verbatim is the part that touches the wire: the
// token endpoint, the form body, the `invalid_grant` diagnosis, and the
// keep-the-old-refresh-token rule (oauth.ts refresh()).
//
// NOTHING HERE RUNS AT IMPORT TIME. `fromEnv()` reads three variables and
// returns null when any is missing — it never throws on an absent credential,
// because absence is a readiness state (channels.ts), not an error.

export interface TokenProvider {
  getAccessToken(): Promise<string>;
}

export const GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";

/** The three variables that make YouTube live. Names only leave this module. */
export const YOUTUBE_ENV_VARS = ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN"] as const;

export class OAuthError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "OAuthError";
  }
}

interface CachedToken {
  accessToken: string;
  /** epoch ms */
  expiresAt: number;
}

export interface RefreshTokenProviderOptions {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  tokenUri?: string;
  fetch?: typeof fetch;
  now?: () => number;
}

export class RefreshTokenProvider implements TokenProvider {
  private cached: CachedToken | null = null;
  private refreshToken: string;

  constructor(private readonly opts: RefreshTokenProviderOptions) {
    this.refreshToken = opts.refreshToken;
  }

  /** null when any of the three variables is unset — absence, not failure. */
  static fromEnv(env: NodeJS.ProcessEnv = process.env, fetchImpl?: typeof fetch): RefreshTokenProvider | null {
    const [id, secret, refresh] = YOUTUBE_ENV_VARS.map((k) => env[k]?.trim());
    if (!id || !secret || !refresh) return null;
    return new RefreshTokenProvider({ clientId: id, clientSecret: secret, refreshToken: refresh, fetch: fetchImpl });
  }

  async getAccessToken(): Promise<string> {
    const now = (this.opts.now ?? Date.now)();
    // a minute of margin: a token that expires mid-chunk fails a request we already paid quota for
    if (this.cached && this.cached.expiresAt - 60_000 > now) return this.cached.accessToken;
    const body = new URLSearchParams({
      client_id: this.opts.clientId,
      client_secret: this.opts.clientSecret,
      grant_type: "refresh_token",
      refresh_token: this.refreshToken,
    });
    const res = await (this.opts.fetch ?? globalThis.fetch)(this.opts.tokenUri ?? GOOGLE_TOKEN_URI, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || typeof json.access_token !== "string") {
      const code = typeof json.error === "string" ? json.error : `http_${res.status}`;
      // StatReel oauth.ts tokenRequest(): the one failure an owner hits weekly
      const hint =
        code === "invalid_grant"
          ? " (refresh token revoked or expired — an OAuth app in 'Testing' status issues 7-day refresh tokens; mint a new YOUTUBE_REFRESH_TOKEN)"
          : "";
      throw new OAuthError(`token request failed: ${code}${hint}`, code);
    }
    // Google may rotate the refresh token; keep the old one when it does not (oauth.ts refresh())
    if (typeof json.refresh_token === "string") this.refreshToken = json.refresh_token;
    this.cached = {
      accessToken: json.access_token,
      expiresAt: now + Number(json.expires_in ?? 3600) * 1000,
    };
    return this.cached.accessToken;
  }
}
