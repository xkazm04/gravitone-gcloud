// LANE 4 — PRIMITIVE A11Y: a role="slider" must be operable by keyboard
// (dynamic).
//
// FrameCanvas's ResizeHandle renders role="slider" tabIndex={0} aria-valuenow,
// so an assistive-tech user is TOLD it is an adjustable slider. Before this fix
// it carried only onPointerDown: tab to it, press the arrows, nothing moves —
// an announced-but-inert control, worse than no role at all (the ARIA contract
// for slider requires arrow-key operation).
//
// ResizeHandle is hook-free, so this probe calls it as a pure function of props,
// pulls the onKeyDown it renders, and drives synthetic arrow-key events through
// it — asserting the handle actually adjusts width/height the way the role
// promises, with Shift as the coarse step and a floor so a layer cannot be
// resized to zero.
import { test, expect } from "@playwright/test";
import { createRef } from "react";
import { ResizeHandle } from "@/app/_phases/frames/parts";
import type { Frame, FrameElement } from "@/app/_phases/frames/frames";

function mkFrame(el: Partial<FrameElement> = {}): Frame {
  const element: FrameElement = {
    id: "el-1",
    kind: "arrow",
    label: "arrow",
    x: 20,
    y: 30,
    w: 40,
    h: 25,
    ...el,
  };
  return { elements: [element] } as unknown as Frame;
}

/** Render the handle and return the props it put on its root span. */
function renderHandle(onResize: (id: string, w: number, h: number) => void) {
  const box = createRef<HTMLDivElement>();
  const tree = (ResizeHandle as unknown as (p: unknown) => unknown)({
    frame: mkFrame(),
    elId: "el-1",
    onResize,
    box,
  }) as { props?: Record<string, unknown> } | null;
  return tree?.props ?? {};
}

function press(key: string, shiftKey = false) {
  const calls: Array<[string, number, number]> = [];
  const props = renderHandle((id, w, h) => calls.push([id, w, h]));
  const onKeyDown = props.onKeyDown;
  expect(typeof onKeyDown).toBe("function"); // the control must listen to the keyboard
  let prevented = false;
  (onKeyDown as (e: unknown) => void)({
    key,
    shiftKey,
    preventDefault: () => {
      prevented = true;
    },
    stopPropagation: () => {},
  });
  return { calls, prevented };
}

test("Lane4: the slider handle exposes a keyboard handler (role is not inert)", () => {
  const props = renderHandle(() => {});
  console.log(`[Lane4] onKeyDown present=${typeof props.onKeyDown === "function"}, role=${String(props.role)}`);
  expect(props.role).toBe("slider");
  expect(typeof props.onKeyDown).toBe("function");
});

test("Lane4: ArrowRight/ArrowLeft nudge width by one; ArrowDown/ArrowUp nudge height", () => {
  // element starts at w=40, h=25.
  expect(press("ArrowRight").calls[0]).toEqual(["el-1", 41, 25]);
  expect(press("ArrowLeft").calls[0]).toEqual(["el-1", 39, 25]);
  expect(press("ArrowDown").calls[0]).toEqual(["el-1", 40, 26]);
  expect(press("ArrowUp").calls[0]).toEqual(["el-1", 40, 24]);
});

test("Lane4: Shift makes the step coarse (ten)", () => {
  expect(press("ArrowRight", true).calls[0]).toEqual(["el-1", 50, 25]);
  expect(press("ArrowUp", true).calls[0]).toEqual(["el-1", 40, 15]);
});

test("Lane4: arrow keys preventDefault (page does not scroll); other keys are ignored", () => {
  expect(press("ArrowRight").prevented).toBe(true);
  const other = press("a");
  expect(other.prevented).toBe(false);
  expect(other.calls).toHaveLength(0);
});

test("Lane4: the box is clamped to a floor — a layer cannot be resized below 1", () => {
  const calls: Array<[string, number, number]> = [];
  const box = createRef<HTMLDivElement>();
  const tree = (ResizeHandle as unknown as (p: unknown) => unknown)({
    frame: mkFrame({ w: 1, h: 1 }),
    elId: "el-1",
    onResize: (id: string, w: number, h: number) => calls.push([id, w, h]),
    box,
  }) as { props?: Record<string, unknown> };
  (tree.props?.onKeyDown as (e: unknown) => void)({
    key: "ArrowLeft",
    shiftKey: false,
    preventDefault: () => {},
    stopPropagation: () => {},
  });
  expect(calls[0]).toEqual(["el-1", 1, 1]); // w would be 0, clamped to 1
});
