// LIFETIME — everything the engine starts outside its own DOM nodes goes
// through here, so destroy() can stop all of it.
//
// The contest variant was a page that never unmounted: it added window
// listeners, timers and observers and let them live forever. In the app the
// landing is one route of an SPA; navigating away must leave nothing behind
// that still answers `/`, the wheel or the pointer. So no engine module calls
// addEventListener on window/document, setTimeout or requestAnimationFrame
// directly — they ask a Life.
//
// THE FRAME LOOP is here too, and it is the only one. Each animated concern
// (the camera's parallax, the carousel's glide) registers a step under a name;
// one requestAnimationFrame drives every step that wants a frame, and stops when
// none does. The infinite CSS animations (sway, drift, pulse, bob) all hang off
// the root's data-tier in the stylesheet, which is the other half of "every
// infinite animation owned by one place": a quality tier stops them all by
// narrowing that one selector.

type Step = (now: number) => boolean;

export class Life {
  dead = false;
  private offs = new Set<() => void>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private frames = new Set<number>();
  private observers = new Set<ResizeObserver>();
  private steps = new Map<string, Step>();
  private loopId = 0;

  /** a tracked listener; returns its own remover */
  on<K extends keyof WindowEventMap>(t: Window, type: K, fn: (e: WindowEventMap[K]) => void, o?: AddEventListenerOptions | boolean): () => void;
  on<K extends keyof DocumentEventMap>(t: Document, type: K, fn: (e: DocumentEventMap[K]) => void, o?: AddEventListenerOptions | boolean): () => void;
  on<K extends keyof HTMLElementEventMap>(t: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void, o?: AddEventListenerOptions | boolean): () => void;
  on(t: EventTarget, type: string, fn: (e: never) => void, o?: AddEventListenerOptions | boolean): () => void {
    const h = fn as unknown as EventListener;
    t.addEventListener(type, h, o);
    let live = true;
    const off = () => {
      if (!live) return;
      live = false;
      t.removeEventListener(type, h, o);
      this.offs.delete(off);
    };
    this.offs.add(off);
    return off;
  }

  timeout(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
    const id = setTimeout(() => {
      this.timers.delete(id);
      if (!this.dead) fn();
    }, ms);
    this.timers.add(id);
    return id;
  }
  clear(id: ReturnType<typeof setTimeout> | 0 | undefined): void {
    if (!id) return;
    clearTimeout(id);
    this.timers.delete(id);
  }
  sleep(ms: number): Promise<void> {
    return new Promise((res) => {
      this.timeout(res, ms);
    });
  }

  /** a one-shot frame callback (layout reads after a build, class flips) */
  raf(fn: (now: number) => void): void {
    const id = requestAnimationFrame((now) => {
      this.frames.delete(id);
      if (!this.dead) fn(now);
    });
    this.frames.add(id);
  }

  observe(ro: ResizeObserver): ResizeObserver {
    this.observers.add(ro);
    return ro;
  }
  unobserve(ro: ResizeObserver): void {
    ro.disconnect();
    this.observers.delete(ro);
  }

  /** asks the one frame loop to run `step` on the next frame; the step keeps
   *  its slot for as long as it returns true. Re-asking while scheduled is free. */
  want(name: string, step: Step): void {
    if (this.dead) return;
    this.steps.set(name, step);
    if (!this.loopId) this.loopId = requestAnimationFrame(this.tick);
  }
  wants(name: string): boolean {
    return this.steps.has(name);
  }
  private tick = (now: number): void => {
    this.loopId = 0;
    if (this.dead) return;
    const due = [...this.steps];
    this.steps.clear();
    for (const [name, step] of due) if (step(now) && !this.steps.has(name)) this.steps.set(name, step);
    if (this.steps.size && !this.loopId) this.loopId = requestAnimationFrame(this.tick);
  };

  destroy(): void {
    this.dead = true;
    for (const off of [...this.offs]) off();
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    for (const id of this.frames) cancelAnimationFrame(id);
    this.frames.clear();
    for (const ro of this.observers) ro.disconnect();
    this.observers.clear();
    if (this.loopId) cancelAnimationFrame(this.loopId);
    this.loopId = 0;
    this.steps.clear();
  }
}
