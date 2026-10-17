// /board - v1's Board, retired in Phase 3 (decision 10). Its decisions are kernel packets now,
// opened from the Floor's piles and decided on the new Board (/board/<packet>). An old address
// - a skill's link, a bookmark, `?src=&i=` - is sent where its work is now (./redirect.ts).
import { redirect } from "next/navigation";

import { v1BoardTarget } from "./redirect.ts";

type Search = Promise<Readonly<Record<string, string | string[] | undefined>>>;

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function V1Board({ searchParams }: { readonly searchParams: Search }) {
  const q = await searchParams;
  redirect(v1BoardTarget({ src: one(q["src"]), i: one(q["i"]), item: one(q["item"]) }));
}
