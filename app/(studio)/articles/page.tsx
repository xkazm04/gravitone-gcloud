// /articles - v1's article run list, retired in Phase 6 wave C: the runs are the Floor's article
// lane (./redirect.ts).
import { redirect } from "next/navigation";

import { ARTICLE_LANE } from "./redirect.ts";

export default function V1Articles() {
  redirect(ARTICLE_LANE);
}
