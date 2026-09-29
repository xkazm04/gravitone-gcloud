// THE KICKER: the small gold caps line above a title: a sheet's, a dialog's, a
// panel's. It names WHICH thing the title belongs to (a run id, a candidate id).

export function Kicker({ children }: { children: React.ReactNode }) {
  return <span className="k-eb k-caps">{children}</span>;
}
