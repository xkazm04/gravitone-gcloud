// WHAT STANDS IN A PANEL WHILE ITS CHUNK IS ON THE WIRE.
//
// The `loading` of every `next/dynamic` split in this app, and the body of the
// route-level `loading.tsx` files. One spelling, because a tab-split view that
// collapses to zero height while its chunk arrives makes the whole page jump,
// and six hand-rolled placeholders would each pick a different height.
//
// Nothing is printed. A "loading…" line is the app talking about itself, and for
// a chunk that lands in tens of milliseconds it is a flash of text the reader
// cannot finish. The box holds the panel's place; `aria-busy` is the non-visual
// half, and the one word is `sr-only` so a screen reader is not left on silence.
//
// No "use client": it holds no state, so it renders from a Server Component
// (loading.tsx) and from a client `dynamic()` call alike.

/** Fills the panel's place while a split chunk loads. `tall` for a whole route. */
export function Pending({ tall = false }: { tall?: boolean }) {
  return (
    <div aria-busy="true" className={tall ? "min-h-screen bg-[var(--gt-ink)]" : "min-h-[60vh]"}>
      <span className="sr-only">loading</span>
    </div>
  );
}

/** `dynamic(() => import("./X"), { loading: pendingPanel })` — the same box, as the function next/dynamic takes. */
export const pendingPanel = () => <Pending />;
