// The frame canvas's gesture (part/FrameCanvas.tsx): what a pointer press, drag, cancel and lift
// leave behind. The unit lane has no DOM, so the component is called as a function under a
// ten-line hook runtime (useState / useRef mocked), and an event is dispatched the way React
// dispatches it: the handlers of ONE committed render, from the target up through its ancestors,
// until one stops propagation; the canvas is re-rendered after each event, as a state change does.
// That is the instrument for the header's promise - "a drag is LOCAL until the pointer lifts and
// then ONE edit leaves" - which a static render cannot see.
import { describe, expect, test, vi } from "vitest";

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], i: 0 }));
vi.mock("react", async (importOriginal) => {
  const R = await importOriginal<typeof import("react")>();
  const slot = <T>(init: () => T): number => {
    const i = hooks.i++;
    if (!(i in hooks.slots)) hooks.slots[i] = init();
    return i;
  };
  return {
    ...R,
    useState: <T>(init: T) => {
      const i = slot(() => init);
      return [hooks.slots[i] as T, (v: T | ((x: T) => T)) => void (hooks.slots[i] = typeof v === "function" ? (v as (x: T) => T)(hooks.slots[i] as T) : v)];
    },
    useRef: <T>(init: T) => hooks.slots[slot(() => ({ current: init }))] as { current: T },
  };
});

import { FrameCanvas, type CanvasLayer, type FrameCanvasProps } from "../../src/components/part/FrameCanvas.tsx";

type El = { readonly type: unknown; readonly props: Readonly<Record<string, unknown>> };
type Ev = { stopped: boolean; readonly clientX: number; readonly clientY: number; readonly pointerId: number; stopPropagation(): void; readonly currentTarget: { setPointerCapture(id: number): void } };

const isEl = (x: unknown): x is El => typeof x === "object" && x !== null && "props" in x && "type" in x;
const kids = (e: El): El[] => [e.props["children"]].flat(Infinity).filter(isEl);

/** The chain from the root to the first element `hit` accepts, root first. */
function pathTo(root: El, hit: (e: El) => boolean): El[] | null {
  if (hit(root)) return [root];
  for (const k of kids(root)) {
    const p = pathTo(k, hit);
    if (p !== null) return [root, ...p];
  }
  return null;
}

const LAYER: CanvasLayer = { id: "e1", layer: "element", role: "box", label: "price", x: 10, y: 20, w: 30, h: 40, hidden: false, unsourced: false };
const ev = (clientX: number, clientY: number): Ev => ({ stopped: false, clientX, clientY, pointerId: 1, stopPropagation() { this.stopped = true; }, currentTarget: { setPointerCapture: () => undefined } });

function mount(over: Partial<FrameCanvasProps> = {}) {
  hooks.slots = [];
  const calls = { move: [] as [number, number][], resize: [] as [number, number][], select: [] as (string | null)[] };
  const props: FrameCanvasProps = {
    label: "0:12 hook",
    plate: { url: "/p.png", state: "ready", dry: false },
    layers: [LAYER],
    selected: "element:e1",
    onSelect: (k) => void calls.select.push(k),
    onMove: (_l, x, y) => void calls.move.push([x, y]),
    onResize: (_l, w, h) => void calls.resize.push([w, h]),
    ...over,
  };
  let tree: El;
  const render = (): void => {
    hooks.i = 0;
    tree = FrameCanvas(props) as unknown as El;
    // The frame's box is 200 x 100 px, so 20 px across is 10% and 10 px down is 10%.
    const box = hooks.slots[0] as { current: unknown };
    box.current = { getBoundingClientRect: () => ({ width: 200, height: 100 }) };
  };
  render();
  const layer = (): El => {
    const p = pathTo(tree, (e) => e.props["data-layer"] === "element:e1");
    if (p === null) throw new Error("the layer is not drawn");
    return p[p.length - 1] as El;
  };
  /** Dispatch `type` at the element `hit` picks, bubbling, then re-render. */
  const fire = (type: string, hit: (e: El) => boolean, e: Ev): void => {
    const path = pathTo(tree, hit);
    if (path === null) throw new Error(`no target for ${type}`);
    for (const el of path.reverse()) {
      const h = el.props[type];
      if (typeof h === "function") (h as (e: Ev) => void)(e);
      if (e.stopped) break;
    }
    render();
  };
  const onLayer = (e: El): boolean => e.props["data-layer"] === "element:e1";
  const onHandle = (e: El): boolean => e.props["aria-hidden"] === "true" && typeof e.props["onPointerDown"] === "function";
  return { calls, layer, fire, onLayer, onHandle };
}

describe("the frame canvas's gesture", () => {
  test("a resize leaves ONE edit when the pointer lifts", () => {
    const c = mount();
    c.fire("onPointerDown", c.onHandle, ev(0, 0));
    c.fire("onPointerMove", c.onHandle, ev(20, 10));
    c.fire("onPointerUp", c.onHandle, ev(20, 10));
    expect(c.calls.resize).toEqual([[40, 50]]);
    expect(c.calls.move).toEqual([]);
  });

  test("a move leaves ONE edit when the pointer lifts, none while it drags", () => {
    const c = mount();
    c.fire("onPointerDown", c.onLayer, ev(0, 0));
    c.fire("onPointerMove", c.onLayer, ev(20, 10));
    expect(c.calls.move).toEqual([]);
    expect((c.layer().props["style"] as { left: string }).left).toBe("20%");
    c.fire("onPointerUp", c.onLayer, ev(20, 10));
    expect(c.calls.move).toEqual([[20, 30]]);
  });
});
