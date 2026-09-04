/**
 * Pure helpers for the DevInspector — kept out of the component so the
 * DOM-walking and path-classification logic stays small and testable. Only
 * meaningful under `npm run dev:inspect`, where the loader in
 * `pipeline/dev-inspector/` stamps host elements with `data-loc="<path>:LINE:COL"`.
 */

export interface LocEntry {
  /** The DOM element carrying this `data-loc`. */
  el: Element;
  /** Raw attribute value: `app/_studio/AssetDrawer.tsx:88:7`. */
  raw: string;
  /** Copied reference (clickable in Claude Code): `app/_studio/AssetDrawer.tsx:88`. */
  loc: string;
  /** Repo-relative path: `app/_studio/AssetDrawer.tsx`. */
  path: string;
  /** 1-based line. */
  line: number;
}

/**
 * Path fragments that mark reusable chrome rather than the surface you clicked.
 * When resolving the DEFAULT copy target the chain skips these and lands on the
 * call site — the step/page file that *used* the primitive — because that is
 * almost always the file you want to change. Alt+right-click still reaches the
 * innermost element, and every rung is one click away in the HUD.
 *
 * `components/ui/` is this repo's primitive shelf (Primitives, Field, Modal,
 * StudioFrame …) and `app/_phases/_shared/` is the chrome every step reuses, so
 * both are library by this definition. `lib/` holds no JSX today beyond
 * GlobalErrorBridge, and is listed so it stays classified if that changes.
 */
const LIBRARY_SEGMENTS = [
  "/lib/",
  "/components/ui/",
  "/app/_phases/_shared/",
  "/app/_dev-inspector/",
];

export function isLibraryPath(path: string): boolean {
  const p = `/${path}`;
  return LIBRARY_SEGMENTS.some((seg) => p.includes(seg));
}

export function parseLoc(raw: string): Omit<LocEntry, "el"> | null {
  const m = /^(.*):(\d+):(\d+)$/.exec(raw);
  if (!m) return null;
  const [, path, lineStr] = m;
  if (!path || !lineStr) return null;
  return { raw, path, line: Number(lineStr), loc: `${path}:${lineStr}` };
}

/** DOM ancestor chain of `[data-loc]` elements, innermost → outermost. */
export function buildChain(start: Element | null): LocEntry[] {
  const out: LocEntry[] = [];
  let el: Element | null = start?.closest("[data-loc]") ?? null;
  while (el) {
    const raw = el.getAttribute("data-loc");
    const parsed = raw ? parseLoc(raw) : null;
    if (parsed) out.push({ el, ...parsed });
    el = el.parentElement?.closest("[data-loc]") ?? null;
  }
  return out;
}

/**
 * Index of the default copy target: the first non-library file in the chain (the
 * call site), falling back to the innermost element when the whole chain is
 * library code.
 */
export function pickDefaultIndex(chain: LocEntry[]): number {
  const i = chain.findIndex((c) => !isLibraryPath(c.path));
  return i === -1 ? 0 : i;
}

/** Collapse consecutive entries that resolve to the same `path:line`. */
export function dedupeChain(chain: LocEntry[]): LocEntry[] {
  return chain.filter((c, i) => i === 0 || c.loc !== chain[i - 1]?.loc);
}
