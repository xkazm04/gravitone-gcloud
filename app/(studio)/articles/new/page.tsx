// /articles/new - v1's topic form, retired in Phase 6 wave C: a run starts from the Floor article
// lane's composer, which reads the same registry subjects (../redirect.ts).
import { redirect } from "next/navigation";

import { ARTICLE_LANE } from "../redirect.ts";

export default function V1NewArticle() {
  redirect(ARTICLE_LANE);
}
