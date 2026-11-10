// THE SESSION COOKIE'S RENEWAL (app/(studio)/_shell/session.ts subscribeSessionCookie): Firebase's
// onIdTokenChanged calls its listener once on subscribe with the current user, then on every
// rotation. A shell the server has just verified (its layout handed Providers an identity) holds a
// good cookie already, so that first call posts nothing; a rotation always posts.
//
// The SDK is LOADED (lib/firebase.ts `loadAuth`), so the subscription starts when the load
// resolves - and an unsubscribe that comes first must win: nothing may subscribe after it.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  fire: (_user: unknown): void => undefined,
  subscribed: 0,
  unsubscribed: 0,
  /** The pending load, when a test holds it open; null loads at once. */
  gate: null as null | { promise: Promise<void>; open: () => void; fail: (e: Error) => void },
}));

const onIdTokenChanged = (_auth: unknown, cb: (user: unknown) => void): (() => void) => {
  sdk.subscribed++;
  sdk.fire = cb;
  // Firebase's contract: the initial call comes with the subscription.
  cb({ getIdToken: async () => "initial-token" });
  return () => {
    sdk.unsubscribed++;
  };
};
vi.mock("@/lib/firebase", () => ({
  firebaseReady: true,
  loadAuth: async () => {
    if (sdk.gate !== null) await sdk.gate.promise;
    return { auth: {}, sdk: { onIdTokenChanged }, google: {} };
  },
}));
const holdLoad = (): void => {
  let open = (): void => undefined;
  let fail = (_e: Error): void => undefined;
  const promise = new Promise<void>((res, rej) => {
    open = res;
    fail = rej;
  });
  sdk.gate = { promise, open, fail };
};
vi.mock("@/lib/devAuth", () => ({ DEV_AUTH: false }));
vi.mock("@/lib/localMode", () => ({ LOCAL_MODE: false }));

const { subscribeSessionCookie } = await import("../../app/(studio)/_shell/session.ts");

const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

let posts: string[] = [];

beforeEach(() => {
  posts = [];
  sdk.gate = null;
  sdk.subscribed = 0;
  sdk.unsubscribed = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      posts.push((JSON.parse(init.body) as { idToken: string }).idToken);
      return new Response("{}", { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("subscribeSessionCookie", () => {
  it("a shell the server just verified does not re-post the token it already holds", async () => {
    const stop = subscribeSessionCookie(() => undefined, true);
    await flush();
    expect(posts).toEqual([]);
    stop();
  });

  it("a rotation after that posts the new token", async () => {
    const stop = subscribeSessionCookie(() => undefined, true);
    await flush();
    sdk.fire({ getIdToken: async () => "rotated-token" });
    await flush();
    expect(posts).toEqual(["rotated-token"]);
    stop();
  });

  it("a shell with no known identity still posts on the first call", async () => {
    const stop = subscribeSessionCookie(() => undefined, false);
    await flush();
    expect(posts).toEqual(["initial-token"]);
    stop();
  });
});

describe("subscribeSessionCookie while the SDK is loading", () => {
  it("subscribes only once the load resolves", async () => {
    holdLoad();
    const stop = subscribeSessionCookie(() => undefined, false);
    await flush();
    expect(sdk.subscribed).toBe(0);
    sdk.gate?.open();
    await flush();
    expect(sdk.subscribed).toBe(1);
    expect(posts).toEqual(["initial-token"]);
    stop();
    expect(sdk.unsubscribed).toBe(1);
  });

  it("an unsubscribe before the load resolves wins: nothing subscribes, nothing posts", async () => {
    holdLoad();
    const stop = subscribeSessionCookie(() => undefined, false);
    stop();
    sdk.gate?.open();
    await flush();
    expect(sdk.subscribed).toBe(0);
    expect(posts).toEqual([]);
  });

  it("a load that fails is reported, and an unsubscribe after it is harmless", async () => {
    holdLoad();
    const heard: string[] = [];
    const stop = subscribeSessionCookie((m) => heard.push(m), false);
    sdk.gate?.fail(new Error("chunk failed"));
    await flush();
    expect(heard).toEqual(["chunk failed"]);
    expect(() => stop()).not.toThrow();
    expect(sdk.subscribed).toBe(0);
  });
});

describe("the shell's wiring", () => {
  it("Providers tells the subscription whether the layout handed it an identity", () => {
    const src = readFileSync(new URL("../../app/(studio)/_shell/Providers.tsx", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, "");
    expect(src).toMatch(/const cookieHeld = identity !== null;/);
    expect(src).toMatch(/subscribeSessionCookie\([\s\S]*?, cookieHeld\)/);
  });
});
