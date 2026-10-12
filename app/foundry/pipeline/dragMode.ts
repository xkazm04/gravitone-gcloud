// THE DRAG MODE: armed -> dragging (-> over a target, which is the caller's
// state) -> dropped | cancelled.
//
// A press ARMS the mode and nothing visible happens: until the pointer has
// travelled DRAG_THRESHOLD px it is a click, and the click must stay a click
// (select, open), so the mode takes no pointer capture and locks no selection
// while armed. Crossing the threshold asks the caller to build its preview
// (`start`) — which is where the authority is asked, once — and only then does
// the mode engage: capture the pointer, lock text selection, and start routing
// moves to the caller.
//
// Every way out is `gesture.ts`'s `end`; this file adds only what is drag-
// specific: the threshold, and the per-frame hook the caller uses for edge
// auto-scroll and for noticing that the dragged card is gone.

import { startGesture, type Exit, type Gesture } from "./gesture";

/** Pixels of travel before a press becomes a drag. Arrange uses 6 and the
 *  calendar 4; a card on a dense board is pressed far more often than it is
 *  dragged, so the larger of the two. */
export const DRAG_THRESHOLD = 6;

export interface DragHooks {
  /** The element that takes pointer capture once the drag is real. */
  surface: HTMLElement;
  /** The threshold was crossed. Build the preview. False = nothing to drag
   *  (the card is already gone): the mode ends as `vanished`. */
  start(): boolean;
  move(x: number, y: number): void;
  /** Once per frame while dragging; return an Exit to end it. */
  frame(): Exit | void;
  /** The mode is over, however it ended. `started` is false for a press that
   *  never became a drag (a click). */
  end(r: { exit: Exit; started: boolean; x: number; y: number }): void;
}

export function pressDrag(press: { pointerId: number; x: number; y: number }, h: DragHooks): Gesture {
  let started = false;
  let x = press.x;
  let y = press.y;
  const g: Gesture = startGesture({
    pointerId: press.pointerId,
    onMove(e) {
      x = e.clientX;
      y = e.clientY;
      if (!started) {
        if (Math.hypot(x - press.x, y - press.y) < DRAG_THRESHOLD) return;
        if (!h.start()) {
          g.end("vanished");
          return;
        }
        started = true;
        g.engage(h.surface);
      }
      h.move(x, y);
    },
    frame: () => (started ? h.frame() : undefined),
    onEnd(exit, e) {
      if (e) {
        x = e.clientX;
        y = e.clientY;
      }
      h.end({ exit, started, x, y });
    },
  });
  return g;
}
