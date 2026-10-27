// THE HANDOFF (app/(studio)/_shell/Handoff.tsx) when the server accepted the post and the next
// request still arrives without the cookie: the layout renders the same Handoff again, its effect
// does not re-run, and before this the screen stayed blank. There is no DOM in this lane, so the
// component runs on a minimal hook harness (useState / useEffect only, cells by call order).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Cell = { value: unknown };
type Fx = { deps: readonly unknown[] | undefined; run: () => void | (() => void); cleanup: void | (() => void) };
const h = vi.hoisted(() => ({ cells: [] as unknown[], fx: [] as unknown[], i: 0, j: 0, dirty: false }));

vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  useState: (init: unknown) => {
    const k = h.i++;
    if (!(k in h.cells)) h.cells[k] = { value: init } satisfies Cell;
    const c = h.cells[k] as Cell;
    return [c.value, (v: unknown) => { c.value = v; h.dirty = true; }];
  },
  useEffect: (run: () => void | (() => void), deps?: readonly unknown[]) => {
    const k = h.j++;
    const prev = h.fx[k] as Fx | undefined;
    const same = prev !== undefined && deps !== undefined && prev.deps !== undefined && deps.every((d, n) => Object.is(d, prev.deps?.[n]));
    if (same) return;
    if (prev !== undefined && typeof prev.cleanup === "function") prev.cleanup();
    h.fx[k] = { deps, run, cleanup: undefined } satisfies Fx;
    pending.push(h.fx[k] as Fx);
  },
}));

const pending: Fx[] = [];
const refresh = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, replace }) }));
vi.mock("@/lib/useAuth", () => ({ useAuth: () => ({ user: user, authResolved: true }) }));
vi.mock("../../app/(studio)/_shell/session.ts", () => ({ BRIDGED: true, postSession: async () => ({ ok: true, value: null }) }));
const user = { getIdToken: async () => "tok" };

const { Handoff, COOKIE_DROPPED, REFRESH_MS } = await import("../../app/(studio)/_shell/Handoff.tsx");

/** One render pass, then the effects it queued (in order), like React's commit. */
function pass(): { props: { message?: string } } | null {
  h.i = 0;
  h.j = 0;
  h.dirty = false;
  const el = Handoff() as { props: { message?: string } } | null;
  while (pending.length > 0) {
    const f = pending.shift() as Fx;
    f.cleanup = f.run();
  }
  return el;
}
const flush = async (): Promise<void> => {
  for (let n = 0; n < 8; n++) await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
  h.cells = [];
  h.fx = [];
  pending.length = 0;
  refresh.mockClear();
  replace.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the handoff after a good post", () => {
  it("refreshes once, then shows the dropped cookie when the layout renders it again", async () => {
    expect(pass()).toBeNull();
    await flush();
    expect(refresh).toHaveBeenCalledTimes(1);
    pass();
    expect(pass()).toBeNull();
    vi.advanceTimersByTime(REFRESH_MS + 1);
    expect(h.dirty).toBe(true);
    expect(pass()?.props.message).toBe(COOKIE_DROPPED);
  });

  it("says nothing when the refresh worked and the handoff went away", async () => {
    pass();
    await flush();
    pass();
    // The layout renders the shell: the component unmounts and its effects are cleaned up.
    for (const f of h.fx as Fx[]) if (typeof f.cleanup === "function") f.cleanup();
    vi.advanceTimersByTime(REFRESH_MS * 3);
    expect((h.cells as Cell[]).some((c) => c.value === COOKIE_DROPPED)).toBe(false);
  });
});
