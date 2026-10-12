// THE LEGIBILITY MEASURER — what only a photograph used to catch, as a number.
//
// The defect this exists for: <Ghost>'s dashed outline shipped at `border-white/30`
// inside `opacity-40`, an effective alpha of ~0.12 on the #080a10 ground. Every gate
// was green; only photographing the screen found it (components/ui/signal/Ghost.tsx).
// A class-string grep cannot see it, because the failure is the PRODUCT of three
// layers (colour alpha x ancestor opacity x the backdrop it lands on).
//
// TWO HALVES, deliberately in one file:
//   1. PURE MATH (`effective`, `contrastRatio`, ...) — no DOM, importable by the Node
//      lane (tests/golden-path/legibility-composite.spec.ts) to prove the arithmetic.
//   2. `measure` — runs INSIDE the page. It is injected as source text together with
//      the pure functions (`measurerSource`), so the page and the Node probe execute
//      the SAME arithmetic rather than two copies that can drift.
//
// THE RULES (acceptance 5 of the card, stated once):
//   - TEXT run: a visible element with its own text node. Floor 4.5; 7 inside a
//     `[data-world="almanac"]` subtree (the kit law). `aria-hidden` text is decoration
//     and is EXCLUDED from the text floor.
//   - NON-TEXT mark: a drawn border that carries state, floor 3 (WCAG 1.4.11).
//     "Carries state" = a dashed/dotted border (the placeholder signal) or a
//     `data-state` attribute on a bordered element. An `aria-hidden` mark is included
//     ONLY when it carries state; plain hairline card borders are not asserted — they
//     separate surfaces, they do not identify a control.
//   - A node's effective alpha = colour alpha x the product of `opacity` on itself and
//     every ancestor. The backdrop is the nearest opaque `background-color` walking up
//     (layers composited bottom-up, each scaled by its own cumulative opacity); the
//     floor under all of it is the ground (--gt-ink / --al-night).
//   - Not modelled: gradients, background images, filters, blend modes, text over
//     video/canvas. A finding is a lower bound on trouble, never a proof of safety.

export type Rgb = [number, number, number];

export const TEXT_FLOOR = 4.5;
export const ALMANAC_TEXT_FLOOR = 7;
export const MARK_FLOOR = 3;
export const DEFAULT_GROUND = "#080a10";

// ── PURE MATH. Each function below must stay free of outside references: they are
//    stringified into the page. ─────────────────────────────────────────────────────

/** `#rrggbb` -> [r, g, b]. */
export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

/** WCAG relative luminance of an sRGB triplet (0..255). */
export function relLuminance(rgb: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

/** WCAG contrast ratio between two opaque colours. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `fg` at `alpha` painted over an opaque `bg`. */
export function over(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  const a = Math.min(1, Math.max(0, alpha));
  return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)) as Rgb;
}

/**
 * The contrast a colour ACTUALLY has once its own alpha, every ancestor's opacity
 * and the ground it lands on are applied.
 *   effective({ rgba: [255, 255, 255, 0.3] }, [0.4], "#080a10")  -> ~1.33  (the 2026-09 Ghost)
 */
export function effective(color: { rgba: [number, number, number, number] }, opacities: number[], ground: string): number {
  const alpha = opacities.reduce((acc, o) => acc * o, color.rgba[3]);
  const g = hexToRgb(ground);
  return contrastRatio(over([color.rgba[0], color.rgba[1], color.rgba[2]], alpha, g), g);
}

export interface Finding {
  kind: "text" | "mark";
  selector: string;
  /** Text run (truncated) or the shape that failed. */
  subject: string;
  ratio: number;
  floor: number;
}

export interface MeasureOptions {
  ground: string;
}

// ── PAGE SIDE ────────────────────────────────────────────────────────────────────

/**
 * Runs in the page. References the pure functions above and the values passed in
 * `opts` ONLY — `measurerSource` supplies the functions by name.
 */
export function measure(opts: { ground: string; textFloor: number; almanacFloor: number; markFloor: number }): Finding[] {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  // Any CSS colour (rgb, oklab, color-mix results...) -> rgba, via the canvas, which
  // is the one parser guaranteed to understand whatever Tailwind 4 emitted.
  const parse = (css: string): [number, number, number, number] => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const ground = hexToRgb(opts.ground);

  const chain = (el: Element): Element[] => {
    const out: Element[] = [];
    for (let n: Element | null = el; n; n = n.parentElement) out.push(n);
    return out; // el first, root last
  };
  const opacityOf = (el: Element) => {
    const o = parseFloat(getComputedStyle(el).opacity);
    return Number.isFinite(o) ? o : 1;
  };

  /** cum[k] = opacity of chain[k] and everything above it. cum[0] is the element's own. */
  const cumulative = (nodes: Element[]) => {
    const acc: number[] = new Array(nodes.length);
    let run = 1;
    for (let k = nodes.length - 1; k >= 0; k--) {
      run *= opacityOf(nodes[k]);
      acc[k] = run;
    }
    return acc;
  };

  const backdrop = (nodes: Element[], cum: number[]): Rgb => {
    const layers: { rgb: Rgb; a: number }[] = [];
    for (let k = 0; k < nodes.length; k++) {
      const [r, g, b, a] = parse(getComputedStyle(nodes[k]).backgroundColor);
      const eff = a * cum[k];
      if (eff > 0) layers.push({ rgb: [r, g, b], a: eff });
      if (eff >= 0.999) break;
    }
    let base: Rgb = ground;
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i].rgb, layers[i].a, base);
    return base;
  };

  const selectorOf = (el: Element) => {
    const parts: string[] = [];
    let n: Element | null = el;
    for (let depth = 0; n && n !== document.body && depth < 4; depth++, n = n.parentElement) {
      const tid = n.getAttribute("data-testid");
      if (tid) {
        parts.unshift(`${n.tagName.toLowerCase()}[data-testid=${tid}]`);
        break;
      }
      const cls = (n.getAttribute("class") ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .join(".");
      const me = n;
      const sibs = me.parentElement ? Array.from(me.parentElement.children).filter((c) => c.tagName === me.tagName) : [];
      const nth = sibs.length > 1 ? `:nth-of-type(${sibs.indexOf(me) + 1})` : "";
      parts.unshift(`${me.tagName.toLowerCase()}${cls ? "." + cls : ""}${nth}`);
    }
    return parts.join(" > ");
  };

  const visible = (el: Element, cum: number) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cum <= 0.01) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 2 && r.height >= 2; // sr-only lives below this
  };

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const findings: Finding[] = [];
  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    const tag = el.tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "noscript" || el.closest("svg")) continue;
    const nodes = chain(el);
    const cum = cumulative(nodes);
    if (!visible(el, cum[0])) continue;
    const cs = getComputedStyle(el);
    const hidden = nodes.some((n) => n.getAttribute("aria-hidden") === "true");

    // ── text ──
    const own = Array.from(el.childNodes)
      .filter((c) => c.nodeType === 3)
      .map((c) => (c.textContent ?? "").trim())
      .join(" ")
      .trim();
    if (own && !hidden) {
      const [r, g, b, a] = parse(cs.color);
      const bd = backdrop(nodes, cum);
      const ratio = contrastRatio(over([r, g, b], a * cum[0], bd), bd);
      const floor = el.closest('[data-world="almanac"]') ? opts.almanacFloor : opts.textFloor;
      if (ratio < floor) {
        findings.push({ kind: "text", selector: selectorOf(el), subject: own.slice(0, 40), ratio: round2(ratio), floor });
      }
    }

    // ── non-text marks ──
    const css = cs as unknown as Record<string, string>;
    const border = (["Top", "Right", "Bottom", "Left"] as const)
      .map((s) => ({ w: parseFloat(css[`border${s}Width`]), style: css[`border${s}Style`], color: css[`border${s}Color`] }))
      .find((b) => b.w > 0 && b.style !== "none" && b.style !== "hidden");
    if (border && (border.style === "dashed" || border.style === "dotted" || el.hasAttribute("data-state"))) {
      const [r, g, b, a] = parse(border.color);
      const bd = backdrop(nodes, cum);
      const ratio = contrastRatio(over([r, g, b], a * cum[0], bd), bd);
      if (ratio < opts.markFloor) {
        findings.push({ kind: "mark", selector: selectorOf(el), subject: `${border.style} ${border.w}px border`, ratio: round2(ratio), floor: opts.markFloor });
      }
    }
  }
  return findings;
}

/** Page-side program: the pure functions by name, then `measure` applied to the options. */
export function measurerSource(opts: MeasureOptions): string {
  const fns = [hexToRgb, relLuminance, contrastRatio, over, measure];
  const args = { ground: opts.ground, textFloor: TEXT_FLOOR, almanacFloor: ALMANAC_TEXT_FLOOR, markFloor: MARK_FLOOR };
  return `(() => {\n${fns.map((f) => f.toString()).join("\n")}\nreturn measure(${JSON.stringify(args)});\n})()`;
}

/** The ratchet's identity for a finding: where it is, not how bad it is (a retuned
 *  alpha that still fails is the same finding; a NEW selector is a new one). */
export function findingKey(f: Finding): string {
  // `:nth-of-type(N)` is dropped from the identity: a list that grows from 10 to 12
  // rows is the same defect twice, not two new ones, and the ratchet must not turn
  // seed-data size into noise. The full selector stays on the Finding for reading.
  return `${f.kind} ${f.selector.replace(/:nth-of-type\(\d+\)/g, "")}`;
}
