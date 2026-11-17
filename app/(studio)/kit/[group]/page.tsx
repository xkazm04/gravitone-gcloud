// /kit/<group> - one group of the kit (../KitGroup.tsx; the groups are ../sections.ts KIT_GROUPS). The tokens are
// /kit itself, so /kit/tokens is not a second address for them; a group the kit does not hold is a 404.
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { KitGroup } from "../KitGroup.tsx";
import { KIT_GROUPS } from "../sections.ts";

type Params = Promise<{ readonly group: string }>;

export async function generateMetadata({ params }: { readonly params: Params }): Promise<Metadata> {
  const { group } = await params;
  const g = KIT_GROUPS.find((x) => x.id === group);
  return { title: `Gravitone · Kit · ${g?.label ?? "not found"}` };
}

export default async function KitGroupPage({ params }: { readonly params: Params }) {
  const { group } = await params;
  const g = KIT_GROUPS.find((x) => x.id === group && x.id !== "tokens");
  if (g === undefined) notFound();
  return <KitGroup group={g.id} />;
}
