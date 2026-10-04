// THE PAGE HEADER: a small gold eyebrow, the page's name in the display voice, and —
// at the right — the page's figure (a constellation, labelled stylised).
// The figure is a slot; the kit draws none, because each page's is its own.

export function PageHead({
  eyebrow,
  title,
  figure,
  caption,
}: {
  eyebrow: string;
  title: string;
  figure?: React.ReactNode;
  /** Under the figure: its name, and the word "stylised". */
  caption?: React.ReactNode;
}) {
  return (
    <section className="k-head">
      <div>
        <div className="k-caps k-head__eb">{eyebrow}</div>
        <h1>{title}</h1>
      </div>
      {figure && (
        <div>
          {figure}
          {caption && <div className="k-figcap k-caps">{caption}</div>}
        </div>
      )}
    </section>
  );
}

/** The small boxed word beside a caption: "stylised", "proposal". */
export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="k-tag">{children}</span>;
}
