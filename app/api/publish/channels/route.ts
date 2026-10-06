// GET /api/publish/channels -> { channels: ChannelReadiness[], mode }
// Variable NAMES and presence only; a value never leaves the server.

import { channelReadiness } from "@/lib/publish/channels";
import { guardAccessOnly } from "@/lib/apiAuth";
import { asContractDenial, toErrorResponse } from "@/lib/publish/http";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await asContractDenial(await guardAccessOnly(req));
  if (denied) return denied;
  try {
    return Response.json(channelReadiness());
  } catch (e) {
    return toErrorResponse(e);
  }
}
