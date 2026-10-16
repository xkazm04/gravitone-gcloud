// /projects/[id]/[part] - a part's EDITOR (STEPS-DESIGN §1-§2; Phase 4 wave C, L38), reached from
// the project's Plan row. The route key is the recipe part's key (`research`, `script`); a key
// the project does not plan, or a part kind with no editor yet (frames until its lot lands, a
// gate, the slot) is a 404 - never an empty editor and never another project's data (v1's
// "Glass Harbor shows Bitcoin": an editor fell back to the fixture when its own record was
// missing). A Server Component: the view is read here through the part port and handed to one
// client island with the port's actions.
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { partNow, serverPart } from "../_part/port.ts";
import { PART_PORT } from "../_part/wire.ts";
import { PartEditor } from "./_edit/PartEditor.tsx";

type Params = Promise<{ readonly id: string; readonly part: string }>;

const decoded = (raw: string): string => {
  if (!raw.includes("%")) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

export async function generateMetadata({ params }: { readonly params: Params }): Promise<Metadata> {
  const { part } = await params;
  return { title: `Gravitone · ${decoded(part)}` };
}

export default async function PartPage({ params }: { readonly params: Params }) {
  const { id, part } = await params;
  const view = await serverPart().loadPart({ projectId: decoded(id), key: decoded(part) });
  if (!view.ok) {
    if (view.error.code === "not-found") notFound();
    throw view.error;
  }
  return <PartEditor first={view.value} port={PART_PORT} nowMs={partNow()} />;
}
