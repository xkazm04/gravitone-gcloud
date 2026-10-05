// GET /api/publish/exports -> { exports: ExportRef[] }   (newest first)

import { listExports } from "@/lib/publish/exports";
import { guardPublish, toErrorResponse } from "@/lib/publish/http";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await guardPublish(req);
  if (denied) return denied;
  try {
    return Response.json({ exports: await listExports() });
  } catch (e) {
    return toErrorResponse(e);
  }
}
