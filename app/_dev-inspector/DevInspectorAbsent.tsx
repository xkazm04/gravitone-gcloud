/**
 * The production stand-in for {@link DevInspector} — and the reason this file
 * exists is a MEASUREMENT, not a precaution.
 *
 * `app/layout.tsx` mounts the inspector behind
 * `process.env.NODE_ENV === "development"`, which Next inlines as a literal, so
 * the JSX is unreachable in a production build. That is enough for the BEHAVIOUR
 * and not enough for the BYTES: a `"use client"` module imported by a Server
 * Component becomes a client-reference entry point in its own right, and the
 * bundler emits it whether or not any branch reaches it. Measured 2026-08-30 on
 * a real `npm run build` — the overlay's minified body, `data-devinspector` and
 * the whole `data-loc` chain walk, all present in a browser chunk. Exactly the
 * distinction components/ui/HarnessBridge.tsx draws between "behaviour is gated"
 * and "nothing ships", landing on the wrong side of it.
 *
 * So the module is swapped out of the graph instead of being reasoned out of it:
 * `next.config.ts` aliases the inspector to THIS file for every production
 * build, and `pipeline/check-bundle.mjs` reads the emitted chunks for
 * `data-devinspector` so a broken alias is a red gate rather than a silent
 * regression.
 *
 * Deliberately NOT a client component: no `"use client"`, so it adds no client
 * reference at all — it renders to nothing on the server and the browser never
 * hears about it.
 */
export default function DevInspectorAbsent() {
  return null;
}
