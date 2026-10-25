// THE SESSION COOKIE'S RENEWAL (app/(studio)/_shell/session.ts subscribeSessionCookie): Firebase's
// onIdTokenChanged calls its listener once on subscribe with the current user, then on every
// rotation. A shell the server has just verified (its layout handed Providers an identity) holds a
// good cookie already, so that first call posts nothing; a rotation always posts.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let fire: (user: unknown) => void = () => undefined;

vi.mock("firebase/auth", () => ({
  onIdTokenChanged: (_auth: unknown, cb: (user: unknown) => void) => {
    fire = cb;
    // Firebase's contract: the initial call comes with the subscription.
    cb({ getIdToken: async () => "initial-token" });
    return () => undefined;
  },
}));
vi.mock("@/lib/firebase", () => ({ firebaseReady: true, authClient: () => ({}) }));
vi.mock("@/lib/devAuth", () => ({ DEV_AUTH: false }));
vi.mock("@/lib/localMode", () => ({ LOCAL_MODE: false }));

const { subscribeSessionCookie } = await import("../../app/(studio)/_shell/session.ts");

const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

let posts: string[] = [];

beforeEach(() => {
  posts = [];
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
    fire({ getIdToken: async () => "rotated-token" });
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

describe("the shell's wiring", () => {
  it("Providers tells the subscription whether the layout handed it an identity", () => {
    const src = readFileSync(new URL("../../app/(studio)/_shell/Providers.tsx", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, "");
    expect(src).toMatch(/const cookieHeld = identity !== null;/);
    expect(src).toMatch(/subscribeSessionCookie\([\s\S]*?, cookieHeld\)/);
  });
});
