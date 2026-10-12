// THE VENDOR BOUNDARY - one counting seam for everything that spends.
//
// Every spend probe used to hand-roll its own `globalThis.fetch = ...` stub and
// count its own calls (music-budget's `stubFetch`, imaging-budget's, ...). That
// is one example per route and one private definition of "a dispatch" per file.
// This installs ONE boundary instead:
//
//   · `fetch` is replaced for every vendor host this repo can bill - Google,
//     Leonardo, Qwen (DashScope), ElevenLabs, Suno, a local ollama daemon - and
//     for any host it does NOT recognise. An unknown host is recorded as a
//     dispatch too (host `unknown:<host>`) and answered 502: a request that
//     leaves the process for somewhere nobody listed must make an "nothing was
//     dispatched" assertion fail, not slip past it;
//   · the `claude` spawn is counted by the stand-in engine withFakeEngine
//     already puts first on PATH (tests/_engine/fake-claude.mjs). No production
//     seam is needed: the real door (`spawnTurn`) is exercised, it simply
//     resolves `claude` to a stand-in that logs the turn and answers a canned
//     envelope. `LOCAL_BINARIES=off` is the default so nothing else (agy,
//     suno's Chrome) can be spawned either;
//   · every dispatch is recorded as `{ host, route, at }`; answers come from a
//     scripted table (`script`) and are 200 `{}` until told otherwise;
//   · state restores itself: `withVendor` puts fetch, PATH and the env it
//     touched back in a `finally`, and refuses to nest.
//
// WHAT A DISPATCH IS. A request that reached the boundary. It is not "a billed
// call": a 429 an adapter retries is several dispatches, and the invariants that
// care about the difference read the `status` each answer carried (`statuses`).
import { cliArgsFingerprint, withFakeEngine, type Cassette } from "./_helpers";

export type VendorId = "google" | "leonardo" | "qwen" | "elevenlabs" | "suno" | "ollama" | "claude";

/** Host -> vendor, matched on the URL's hostname (loopback on any port is ollama). */
const HOSTS: readonly [RegExp, VendorId][] = [
  [/(^|\.)generativelanguage\.googleapis\.com$/, "google"],
  [/(^|\.)cloud\.leonardo\.ai$/, "leonardo"],
  [/(^|\.)dashscope[\w-]*\.aliyuncs\.com$/, "qwen"],
  [/(^|\.)api\.elevenlabs\.io$/, "elevenlabs"],
  [/(^|\.)suno\.(com|ai)$/, "suno"],
  [/^(127\.0\.0\.1|localhost|\[::1\])$/, "ollama"],
];

/** Hosts a request may reach without it being a spend: identity lookups for the
 *  principal door. Answered empty and never counted. */
const NOT_SPEND = [/(^|\.)securetoken\.google\.com$/, /(^|\.)oauth2\.googleapis\.com$/, /(^|\.)www\.googleapis\.com$/];

export interface Dispatch {
  host: VendorId | `unknown:${string}`;
  /** `METHOD /path` for a fetch; `claude -p` for a spawned turn. */
  route: string;
  /** Wall clock at the boundary. A claude turn is read back from the stand-in's
   *  own log, which carries no clock, so its `at` is the moment it was read. */
  at: number;
}

export interface Answer {
  status: number;
  /** An object is sent as JSON, a string as-is, a Uint8Array as raw bytes. */
  body?: unknown;
  contentType?: string;
  /** Delay before answering, ms. */
  delayMs?: number;
}

/** Decide one answer. `n` is how many dispatches this vendor has seen, counting
 *  this one (1-based); `body` is the request body when it was a string. */
export type Responder = (d: Dispatch & { n: number; body: string }) => Answer;

export interface Vendor {
  /** Every dispatch so far: fetches in arrival order, then claude turns. */
  dispatches(): Dispatch[];
  /** Dispatch count, as a cursor for `since`. */
  mark(): number;
  /** The dispatches after a cursor taken from `mark()`. */
  since(mark: number): Dispatch[];
  /** The status each fetch dispatch was answered with, parallel to the fetch
   *  entries of `dispatches()`. */
  statuses(): number[];
  /** Replace the answer table for one vendor. */
  script(host: VendorId, responder: Responder): void;
  /** Forget dispatches and scripted answers (not the install). */
  clear(): void;
}

let installed = false;

/** A one-turn cassette the claude stand-in answers, so a spawned turn settles
 *  instead of failing on "no turn matched". */
function counterCassette(): Cassette {
  return {
    name: "vendor-boundary",
    source: "hand-written",
    recordedAt: new Date().toISOString().slice(0, 10),
    cliVersion: "0.0.0-fake",
    cliArgsFingerprint: cliArgsFingerprint(),
    turns: [{ prompt: null, mode: "ok", envelope: { type: "result", subtype: "success", is_error: false, result: "{}" } }],
  };
}

/**
 * Run `fn` with the boundary installed.
 *
 * `localBinaries` defaults to `"off"`: the hosted posture, where no local binary
 * may be spawned. Pass `"on"` only to count a `claude` turn a probe expects.
 *
 * A probe file that calls this must register `keepEnv(["LOCAL_BINARIES", ...FAKE_ENGINE_ENV])`
 * at file scope as the belt to this function's braces (the `finally` below),
 * for the same reason withFakeEngine's own doc gives.
 */
export async function withVendor<T>(
  fn: (v: Vendor) => Promise<T>,
  opts: { localBinaries?: "off" | "on" } = {},
): Promise<T> {
  if (installed) throw new Error("withVendor: the boundary is already installed - one boundary at a time, not nested");
  installed = true;
  const realFetch = globalThis.fetch;
  const priorBinaries = process.env.LOCAL_BINARIES;
  const fetched: Dispatch[] = [];
  const statuses: number[] = [];
  const perHost = new Map<string, number>();
  const responders = new Map<VendorId, Responder>();
  let engineTurns = (): number => 0;

  const answer = (d: Dispatch, body: string): Answer => {
    if (d.host.startsWith("unknown:")) return { status: 502, body: { error: "unlisted host" } };
    const n = (perHost.get(d.host) ?? 0) + 1;
    perHost.set(d.host, n);
    const responder = responders.get(d.host as VendorId) ?? (() => ({ status: 200, body: {} }));
    return responder({ ...d, n, body });
  };

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = typeof input === "string" || input instanceof URL ? null : input;
    const url = new URL(req ? req.url : String(input));
    const hit = HOSTS.find(([re]) => re.test(url.hostname));
    if (!hit && NOT_SPEND.some((re) => re.test(url.hostname)))
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    const d: Dispatch = {
      host: hit ? hit[1] : `unknown:${url.hostname}`,
      route: `${(init?.method ?? req?.method ?? "GET").toUpperCase()} ${url.pathname}`,
      at: Date.now(),
    };
    fetched.push(d);
    const a = answer(d, typeof init?.body === "string" ? init.body : "");
    statuses.push(a.status);
    if (a.delayMs) await new Promise((r) => setTimeout(r, a.delayMs));
    if (a.body instanceof Uint8Array)
      return new Response(a.body as BodyInit, { status: a.status, headers: { "content-type": a.contentType ?? "application/octet-stream" } });
    const body = typeof a.body === "string" ? a.body : JSON.stringify(a.body ?? {});
    return new Response(body, { status: a.status, headers: { "content-type": a.contentType ?? "application/json" } });
  }) as typeof fetch;

  process.env.LOCAL_BINARIES = opts.localBinaries ?? "off";

  const vendor: Vendor = {
    dispatches: () => [
      ...fetched,
      ...Array.from({ length: engineTurns() }, (): Dispatch => ({ host: "claude", route: "claude -p", at: Date.now() })),
    ],
    mark: () => fetched.length + engineTurns(),
    since: (m) => vendor.dispatches().slice(m),
    statuses: () => [...statuses],
    script: (host, r) => void responders.set(host, r),
    clear: () => {
      fetched.length = 0;
      statuses.length = 0;
      perHost.clear();
      responders.clear();
    },
  };

  try {
    return await withFakeEngine(counterCassette(), async (engine) => {
      engineTurns = () => engine.turns().length;
      return await fn(vendor);
    });
  } finally {
    globalThis.fetch = realFetch;
    if (priorBinaries === undefined) delete process.env.LOCAL_BINARIES;
    else process.env.LOCAL_BINARIES = priorBinaries;
    installed = false;
  }
}
