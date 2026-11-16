// RUNS' SELECTION, HELD WHERE THE ADDRESS IS (./url.ts). The island owns it and writes it back with
// history.replaceState (Next's router follows that without a server round trip). A NAVIGATION to
// Runs with a different address - the header's needs chip clicked while Runs is open, a part's
// failed-job door - renders the page again with new search params but the same island, so a
// selection held only in state would ignore it. The server's reading is adopted whenever it
// changes, by value: a router.refresh() renders the address the island already wrote, which
// reads equal and changes nothing.
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import { runsSearch, type Selection } from "./url.ts";

export function useSelection(initial: Selection): readonly [Selection, Dispatch<SetStateAction<Selection>>] {
  const [sel, setSel] = useState<Selection>(initial);
  const arrived = runsSearch(initial);
  const [seen, setSeen] = useState(arrived);
  if (seen !== arrived) {
    setSeen(arrived);
    setSel(initial);
  }
  useEffect(() => {
    const qs = runsSearch(sel);
    const next = `${window.location.pathname}${qs === "" ? "" : `?${qs}`}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", next);
  }, [sel]);
  return [sel, setSel];
}
