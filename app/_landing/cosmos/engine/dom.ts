// DOM helpers and the inline icon set. The interactive half only.

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, parent?: Element | null): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

/** a canvas of w by h CSS pixels at raster scale rs, its context pre-scaled */
export function makeCanvas(w: number, h: number, rs: number): { cv: HTMLCanvasElement; c: CanvasRenderingContext2D } {
  const cv = document.createElement("canvas");
  cv.width = Math.ceil(w * rs);
  cv.height = Math.ceil(h * rs);
  const c = cv.getContext("2d") as CanvasRenderingContext2D;
  c.scale(rs, rs);
  return { cv, c };
}

export const ICON = {
  stack:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><rect x="3.5" y="9" width="14" height="10.5" rx="1.8"/><path d="M7 6h13.5v10.5M10.5 3h10"/></svg>',
  clock:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="12" cy="12" r="8.2"/><path d="M12 7.2V12l3.2 2"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="10" rx="2.4"/><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><rect x="3" y="14.5" width="18" height="5" rx="1.6"/><rect x="5" y="9.5" width="14" height="5" rx="1.6"/><rect x="7" y="4.5" width="10" height="5" rx="1.6"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9.5 5.5 6.5 6.5-6.5 6.5"/></svg>',
};
