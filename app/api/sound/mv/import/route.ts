// POST /api/sound/mv/import { dir } -> MvImportResult { added, skipped, takeIds }
//
// Every audio file directly in a folder on the studio machine becomes a
// finalized take (lib/sound/mv/importFolder.ts). It reads the local disk and
// writes the sound store, so guardRequest, and imaging-auth.probe.spec.ts
// drives it: an empty body is a 400 from the `dir` check before anything is
// read.
//
// LOCAL ONLY, asked of lib/deployment.ts BEFORE the body is read, as the export
// routes do (it sits in lib/capabilities.ts CAPABILITY_ROUTES.localRender, and
// posture-coherence drives every route there for a 503 in both forbidding
// postures): on a managed platform "a folder on this machine" is a container's
// disk, not the operator's, and the answer is the posture's own sentence with
// the code the deployment-cell lane reads as "this deployment cannot".

import { guardRequest } from "@/lib/apiAuth";
import { canSpawnLocalBinaries, describePosture, localPosture } from "@/lib/deployment";
import { asContractDenial, errorResponse, readJson, toErrorResponse } from "@/lib/sound/http";
import { importFolder, parseImportDir } from "@/lib/sound/mv/importFolder";

export const runtime = "nodejs";
/** Twenty mp3s are a few hundred MB read and written once. */
export const maxDuration = 300;

export async function POST(req: Request) {
  const denied = await asContractDenial(await guardRequest(req));
  if (denied) return denied;
  try {
    if (!canSpawnLocalBinaries())
      return errorResponse(
        `a folder import reads the studio machine's own disk, and this deployment is not that machine: ${describePosture(localPosture())}`,
        503,
        "local-binaries-forbidden",
      );
    const dir = parseImportDir(await readJson(req));
    return Response.json(await importFolder(dir));
  } catch (e) {
    return toErrorResponse(e);
  }
}
