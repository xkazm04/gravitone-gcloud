// GET /api/publish/exports -> { exports: ExportRef[] }   (newest first)

import { listExports } from "@/lib/publish/exports";
import { guardAccessOnly } from "@/lib/apiAuth";
import { asContractDenial, toErrorResponse } from "@/lib/publish/http";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await asContractDenial(await guardAccessOnly(req));
  if (denied) return denied;
  try {
    return Response.json({ exports: await listExports() });
  } catch (e) {
    return toErrorResponse(e);
  }
}
