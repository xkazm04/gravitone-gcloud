// THE AUTH CONTEXT WITH A LOADED SDK (lib/useAuth.tsx over lib/firebase.ts `loadAuth`, 2026-11-09).
// Firebase is fetched by the first auth effect instead of imported, and nothing the two flags mean
// may move with it:
//   · authResolved stays false until onAuthStateChanged has answered (or config is absent), so a
//     gated surface keeps failing CLOSED while the SDK is on its way;
//   · DEV_AUTH resolves without ever asking for the SDK;
//   · the token cache subscribes, and identity eviction fires, on the same transitions as before:
//     the cache once per client, the eviction on a uid flip and never on a same-uid answer;
//   · an unmount before the load lands subscribes nothing;
//   · sign-in uses the loaded client's Google provider, and a blocked popup still falls back to
//     the full-page redirect.
// There is no DOM in this lane, so AuthProvider runs on a minimal hook harness (cells by call
// order), the way tests/next-server/shell-handoff.test.ts runs the Handoff.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Fx = { deps: readonly unknown[] | undefined; run: () => void | (() => void); cleanup: void | (() => void) };
const h = vi.hoisted(() => ({ cells: [] as { value: unknown }[], fx: [] as unknown[], i: 0, j: 0, pending: [] as unknown[] }));

vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  useState: (init: unknown) => {
    const k = h.i++;
    if (!(k in h.cells)) h.cells[k] = { value: init };
    const c = h.cells[k]!;
    return [c.value, (v: unknown) => { c.value = v; }];
  },
  useRef: (init: unknown) => {
    const k = h.i++;
    if (!(k in h.cells)) h.cells[k] = { value: { current: init } };
    return h.cells[k]!.value;
  },
  useCallback: (fn: unknown) => {
    const k = h.i++;
    if (!(k in h.cells)) h.cells[k] = { value: fn };
    return h.cells[k]!.value;
  },
  useMemo: (fn: () => unknown) => fn(),
  useEffect: (run: () => void | (() => void), deps?: readonly unknown[]) => {
    const k = h.j++;
    const prev = h.fx[k] as Fx | undefined;
    if (prev !== undefined && deps !== undefined && prev.deps !== undefined && deps.every((d, n) => Object.is(d, prev.deps?.[n]))) return;
    if (prev !== undefined && typeof prev.cleanup === "function") prev.cleanup();
    h.fx[k] = { deps, run, cleanup: undefined } satisfies Fx;
    h.pending.push(h.fx[k]);
  },
}));

const s = vi.hoisted(() => ({
  ready: true,
  dev: false,
  loads: 0,
  gate: null as null | { promise: Promise<void>; open: () => void; fail: (e: Error) => void },
  state: null as null | ((u: { uid: string } | null) => void),
  stateSubs: 0,
  stateStops: 0,
  tokenSubs: [] as unknown[],
  tokenStops: 0,
  evicted: [] as [string, string][],
  popup: null as null | Error,
  calls: [] as string[],
}));

const AUTH = { name: "the-client" };
const GOOGLE = { name: "the-provider" };
const SDK = {
  getRedirectResult: async () => null,
  onAuthStateChanged: (_a: unknown, cb: (u: { uid: string } | null) => void) => {
    s.stateSubs++;
    s.state = cb;
    return () => {
      s.stateStops++;
    };
  },
  browserLocalPersistence: {},
  setPersistence: async () => undefined,
  signInWithPopup: async (a: unknown, p: unknown) => {
    s.calls.push(`popup ${a === AUTH} ${p === GOOGLE}`);
    if (s.popup) throw s.popup;
  },
  signInWithRedirect: async (a: unknown, p: unknown) => {
    s.calls.push(`redirect ${a === AUTH} ${p === GOOGLE}`);
  },
  signOut: async () => undefined,
};

vi.mock("../../lib/firebase", () => ({
  get firebaseReady() {
    return s.ready;
  },
  loadAuth: async () => {
    s.loads++;
    if (s.gate !== null) await s.gate.promise;
    return { auth: AUTH, sdk: SDK, google: GOOGLE };
  },
}));
vi.mock("../../lib/devAuth", () => ({
  get DEV_AUTH() {
    return s.dev;
  },
  DEV_USER: { uid: "dev-user" },
}));
vi.mock("../../lib/localMode", () => ({ LOCAL_MODE: false, LOCAL_USER: { uid: "local" }, localEntryChosen: () => false }));
vi.mock("../../lib/sessionToken", () => ({
  subscribeSessionToken: (auth: unknown) => {
    s.tokenSubs.push(auth);
    return () => {
      s.tokenStops++;
    };
  },
}));
vi.mock("../../lib/identityEviction", () => ({
  transitionFor: (was: string, now: string | null) => (was === now ? null : now === null ? "session-ended" : "account-switched"),
  evictIdentity: async (uid: string, reason: string) => {
    s.evicted.push([uid, reason]);
  },
}));

const { AuthProvider } = await import("../../lib/useAuth.tsx");

type Value = { user: { uid: string } | null; loading: boolean; authResolved: boolean; error: string | null; signIn: () => Promise<void> };

/** One render pass and the effects it queued, like React's commit; the context value it drew. */
function pass(): Value {
  h.i = 0;
  h.j = 0;
  const el = AuthProvider({ children: null }) as unknown as { props: { value: Value } };
  while (h.pending.length > 0) {
    const f = h.pending.shift() as Fx;
    f.cleanup = f.run();
  }
  return el.props.value;
}
const unmount = (): void => {
  for (const f of h.fx as Fx[]) if (typeof f.cleanup === "function") f.cleanup();
};
const flush = async (): Promise<void> => {
  for (let n = 0; n < 3; n++) await new Promise((r) => setTimeout(r, 0));
};
const holdLoad = (): void => {
  let open = (): void => undefined;
  let fail = (_e: Error): void => undefined;
  const promise = new Promise<void>((res, rej) => {
    open = res;
    fail = rej;
  });
  s.gate = { promise, open, fail };
};

beforeEach(() => {
  h.cells = [];
  h.fx = [];
  h.pending = [];
  Object.assign(s, { ready: true, dev: false, loads: 0, gate: null, state: null, stateSubs: 0, stateStops: 0, tokenSubs: [], tokenStops: 0, evicted: [], popup: null, calls: [] });
  vi.stubGlobal("document", { cookie: "" });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authResolved while the SDK loads", () => {
  it("stays false (and loading true) until onAuthStateChanged answers, then resolves signed out", async () => {
    holdLoad();
    let v = pass();
    expect(s.loads).toBe(1);
    expect(v.authResolved).toBe(false);
    expect(v.loading).toBe(true);
    s.gate?.open();
    await flush();
    v = pass();
    // The SDK is here and subscribed, but nobody has answered yet: still closed.
    expect(s.stateSubs).toBe(1);
    expect(v.authResolved).toBe(false);
    s.state?.(null);
    v = pass();
    expect(v.authResolved).toBe(true);
    expect(v.loading).toBe(false);
    expect(v.user).toBeNull();
  });

  it("a load that fails leaves authResolved false (closed) and says why", async () => {
    holdLoad();
    pass();
    s.gate?.fail(new Error("chunk failed"));
    await flush();
    const v = pass();
    expect(v.authResolved).toBe(false);
    expect(v.error).toBe("chunk failed");
    expect(v.loading).toBe(false);
  });

  it("no config resolves at once, signed out, without asking for the SDK", () => {
    s.ready = false;
    pass();
    const v = pass();
    expect(s.loads).toBe(0);
    expect(v.authResolved).toBe(true);
    expect(v.user).toBeNull();
  });

  it("DEV_AUTH resolves at once as the fixture account and never asks for the SDK", () => {
    s.dev = true;
    pass();
    const v = pass();
    expect(s.loads).toBe(0);
    expect(v.authResolved).toBe(true);
    expect(v.user).toEqual({ uid: "dev-user" });
  });
});

describe("the same transitions as before", () => {
  it("the token cache subscribes once, on the loaded client, before the identity listener", async () => {
    pass();
    await flush();
    expect(s.tokenSubs).toEqual([AUTH]);
    expect(s.stateSubs).toBe(1);
  });

  it("eviction fires on a uid flip, never on a same-uid answer or the first sign-in", async () => {
    pass();
    await flush();
    s.state?.({ uid: "a" });
    s.state?.({ uid: "a" });
    await flush();
    expect(s.evicted).toEqual([]);
    s.state?.({ uid: "b" });
    await flush();
    expect(s.evicted).toEqual([["a", "account-switched"]]);
    s.state?.(null);
    await flush();
    expect(s.evicted).toEqual([["a", "account-switched"], ["b", "session-ended"]]);
  });

  it("an unmount before the load lands subscribes nothing", async () => {
    holdLoad();
    pass();
    unmount();
    s.gate?.open();
    await flush();
    expect(s.tokenSubs).toEqual([]);
    expect(s.stateSubs).toBe(0);
  });

  it("an unmount after it stops both subscriptions", async () => {
    pass();
    await flush();
    unmount();
    expect(s.tokenStops).toBe(1);
    expect(s.stateStops).toBe(1);
  });
});

describe("sign-in on the loaded client", () => {
  it("opens the popup with the client's own Google provider", async () => {
    const v = pass();
    await flush();
    await v.signIn();
    expect(s.calls).toEqual(["popup true true"]);
  });

  it("a blocked popup falls back to the full-page redirect", async () => {
    s.popup = Object.assign(new Error("blocked"), { code: "auth/popup-blocked" });
    const v = pass();
    await flush();
    await v.signIn();
    expect(s.calls).toEqual(["popup true true", "redirect true true"]);
  });
});
