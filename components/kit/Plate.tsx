// AN IMAGE ON A PLATE: registration corners at the four corners, the way an
// engraved plate is marked. This is also the focus ring's shape: a focused
// tile wears the same corners (see Tile).

export function Plate({ children, flat = false }: { children: React.ReactNode; flat?: boolean }) {
  return (
    <div className={`k-plate${flat ? " k-plate--flat" : ""}`}>
      <i className="k-reg k-reg--a" aria-hidden="true" />
      <i className="k-reg k-reg--b" aria-hidden="true" />
      <i className="k-reg k-reg--c" aria-hidden="true" />
      <i className="k-reg k-reg--d" aria-hidden="true" />
      {children}
    </div>
  );
}
