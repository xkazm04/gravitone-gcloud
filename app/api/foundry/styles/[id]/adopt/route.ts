// POST /api/foundry/styles/<id>/adopt — a proven style as an adoption draft.
//
// POST, not GET: it spends a recognize call, so it takes the full guard (auth +
// rate) like /api/foundry/extract. The route exports no GET on purpose — Next
// answers 405 for a method a route does not export. A candidate is refused 409
// before any recognizer call; a machine without the kept plate answers 200
// with a `paletteMissing` draft, never a 500.

import { readFile } from "node:fs/promises";

import { guardRequest } from "@/lib/apiAuth";
import { adoptionDraft, type AdoptIO } from "@/lib/foundry/adopt";
import { FoundryError, getCatalogue, resolveInRun } from "@/lib/foundry/store";
import { recognize } from "@/lib/imaging/router";

export const runtime = "nodejs";
export const maxDuration = 60;

/** The real port: plates off the run directory, the recognizer through the
 *  imaging router as it stands. */
const liveAdoptIO: AdoptIO = {
  async readPlate(run, rel) {
    try {
      const bytes = await readFile(resolveInRun(run, rel));
      return { base64: bytes.toString("base64"), mime: "image/png" };
    } catch {
      return null;
    }
  },
  async recognize(image, instruction, schema) {
    return (await recognize({ image, instruction, schema })).json;
  },
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardRequest(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    const cat = await getCatalogue();
    const style = cat.styles.find((s) => s.id === id);
    if (!style) return Response.json({ detail: `No style called ${id}.` }, { status: 404 });
    return Response.json(await adoptionDraft(style, cat.ledger, liveAdoptIO));
  } catch (e) {
    if (e instanceof FoundryError) return Response.json({ detail: e.message, code: "foundry" }, { status: e.status });
    throw e;
  }
}
