"use server";

import { err, type Result } from "@gt/domain/errors";

import type { CoverLaunch, CoverPlan } from "./contract.ts";

// WP0 STUB, filled by WP2.
export async function launchCoverAct(_plan: CoverPlan, _token?: string): Promise<Result<CoverLaunch>> {
  return err("unavailable", "not built yet");
}
export async function pickCoverAct(_id: string, _seed: number): Promise<Result<{ readonly winnerUrl: string }>> {
  return err("unavailable", "not built yet");
}
export async function saveCoverStylesAct(_id: string, _styles: { readonly sourceStyle?: string; readonly remixStyle?: string }): Promise<Result<void>> {
  return err("unavailable", "not built yet");
}
