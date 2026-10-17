// /foundry - v1's Foundry, retired in Phase 6 wave C. Its plant row and Pipeline canvas became
// the Floor: running work in each lane's Foundry cells, the piles at the Weir (decided on the
// Board), the shelves beside them; the canvas's mv Regenerate and Send-to-Calendar are acts over
// the kernel mv producer (owner ruling 2026-10-17). v1 kept no view in this address (no search
// params since its round 3), so every old link lands on the Floor (plan §5.7).
import { redirect } from "next/navigation";

import { FOUNDRY_TARGET } from "./redirect.ts";

export default function V1Foundry() {
  redirect(FOUNDRY_TARGET);
}
