// /calendar - v1's Calendar, retired in Phase 6 wave C. The month and its slots live on the
// Floor (`/floor?cal=1`); an old address is sent there, its slot opened (./redirect.ts).
import { redirect } from "next/navigation";

import { v1CalendarTarget } from "./redirect.ts";

type Search = Promise<Readonly<Record<string, string | string[] | undefined>>>;

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function V1Calendar({ searchParams }: { readonly searchParams: Search }) {
  const q = await searchParams;
  redirect(v1CalendarTarget({ slot: one(q["slot"]) }));
}
