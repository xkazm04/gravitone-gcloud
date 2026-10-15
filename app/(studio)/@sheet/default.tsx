// The sheet slot when nothing intercepts: no sheet. Every slot needs a default since Next 16
// (a hard load of /floor, /ledger, … has no `@sheet` match to recover).
export default function NoSheet() {
  return null;
}
