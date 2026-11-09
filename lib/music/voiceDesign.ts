// THE VOICE DESIGN SEAM (spark concept-casting-stages S0): the final signatures S3 fills from PoF's design, preview
// and create calls (model eleven_v3). A stub so a casting round compiles against one shape; every body refuses until
// S3 lands. A preview comes from the design call; a vendor voice is created only on the pick, because the account's
// voice slots are limited. No budget; consumed credits are read from the API and shown on the round.

import type { Result } from "@gt/domain/errors";
import type { CreditRead, VoiceCandidate } from "@gt/domain/production";

const notBuilt = (fn: string): never => {
  throw new Error(`lib/music/voiceDesign.ts: ${fn} is not built yet (S3)`);
};

export type VoiceDesignRequest = {
  /** The role's voice brief, with direction tags. */
  readonly brief: string;
  /** The per-role audition script the previews speak. */
  readonly script: string;
  /** How many options; a round asks for ROUND_VOICES over as many calls as it takes (3 per call). */
  readonly count: number;
};

export type VoiceDesignResult = {
  readonly voices: readonly VoiceCandidate[];
  readonly creditsUsed: number;
  readonly creditsRead: CreditRead;
};

export async function designVoices(request: VoiceDesignRequest): Promise<Result<VoiceDesignResult>> {
  return notBuilt(`designVoices(${request.count})`);
}

/** Create the vendor voice from the picked preview; returns the vendor's voice id. */
export async function createVoiceFromPreview(input: { readonly generatedVoiceId: string; readonly name: string; readonly description: string }): Promise<Result<{ readonly voiceId: string }>> {
  return notBuilt(`createVoiceFromPreview(${input.name})`);
}
