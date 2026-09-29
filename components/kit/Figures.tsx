// A STRIP OF FIGURES: pictures with their captions, in a wrapping grid: the
// sources a run read, the renders a style has been kept on. A figure can carry a
// state in its rule (read: white, failed: Antares), never in colour alone: the
// caption says the word.

export interface FigureItem {
  id: string;
  src: string;
  alt: string;
  caption: string;
  state?: "read" | "failed";
}

export function Figures({ items }: { items: FigureItem[] }) {
  return (
    <div className="k-strip2">
      {items.map((f) => (
        <figure key={f.id} className={f.state === "read" ? "k-rd" : f.state === "failed" ? "k-bad" : undefined}>
          {/* eslint-disable-next-line @next/next/no-img-element -- local disk through the file seam */}
          <img src={f.src} alt={f.alt} loading="lazy" />
          <figcaption>{f.caption}</figcaption>
        </figure>
      ))}
    </div>
  );
}
