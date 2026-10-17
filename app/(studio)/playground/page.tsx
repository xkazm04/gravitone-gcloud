// /playground - v1's Sound lab, retired in Phase 6 wave C: its Arrange, Hunt, Lessons, Strengths,
// Rubric and Batch are sections of the Audio desk (/audio), its triage the Board's audio packet.
// A bookmark, a skill's link or a ledger row from before the cutover is sent where its work is
// now (./redirect.ts).
import { redirect } from "next/navigation";

import { playgroundTarget } from "./redirect.ts";

type Search = Promise<Readonly<Record<string, string | string[] | undefined>>>;

export default async function V1Playground({ searchParams }: { readonly searchParams: Search }) {
  redirect(playgroundTarget(await searchParams));
}
