// THE TOP BAR. Brand on the left, the path beside it, places and the account on
// the right. Slots, not strings: the page owns what goes in them.

export function Bar({
  brand,
  crumbs,
  nav,
  right,
}: {
  brand: React.ReactNode;
  crumbs?: React.ReactNode;
  /** The app's places (`<BarLink>`s). Hidden below 860px. */
  nav?: React.ReactNode;
  /** Account controls — bell, user menu. */
  right?: React.ReactNode;
}) {
  return (
    <header className="k-bar">
      {brand}
      {crumbs}
      {nav && <nav className="k-bar__nav k-caps" aria-label="Places">{nav}</nav>}
      {right && <div className="k-bar__right" style={nav ? undefined : { marginLeft: "auto" }}>{right}</div>}
    </header>
  );
}
