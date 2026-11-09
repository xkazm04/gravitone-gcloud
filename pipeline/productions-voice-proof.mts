// PRODUCTIONS-VOICE-PROOF - stores the result of the ref-audios proof (spark concept-casting-stages S5).
//
//   node pipeline/productions-voice-proof.mts (--store <file> | --real) --read
//   node pipeline/productions-voice-proof.mts (--store <file> | --real) --set held|failed [--note "<why>"] [--evidence <path>]
//
// The proof itself is a banked GPU job (foundry-out/spark-casting-s5/ref-audios-proof.md). Until a `held` result is stored
// here, the production's dialogue route is `dub` and the ref-audio route and its speaking takes are refused. Only a person's
// judgement of the proof is stored: run this after watching the takes.
//
//   Exit 0 ok · 2 usage or could not run.
//
// PLAIN `node`: lib-hooks gives this process what Next gives the server.

import "./lib-hooks.mts";

const args = process.argv.slice(2);
const value = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name: string): boolean => args.includes(name);

async function main(): Promise<number> {
  const storeArg = value("--store");
  if (storeArg === undefined && !flag("--real")) {
    console.error("usage: productions-voice-proof.mts (--store <file> | --real) (--read | --set held|failed [--note <why>] [--evidence <path>])");
    return 2;
  }
  const { openKernel } = await import("@gt/kernel/kernel");
  const { recordVoiceProofIn, voiceProofOf } = await import("@gt/kernel/productions/audio");
  const { kernel } = await import("../lib/kernelProcess.ts");
  const opened = storeArg === undefined ? kernel() : openKernel(storeArg);
  if (!opened.ok) {
    console.error(opened.error.message);
    return 2;
  }
  const store = opened.value.store;
  const outcome = value("--set");
  if (outcome === undefined) {
    const read = store.read((r) => voiceProofOf(r));
    if (!read.ok) {
      console.error(read.error.message);
      return 2;
    }
    console.log(JSON.stringify(read.value ?? { outcome: "not recorded", route: "dub" }, null, 2));
    return 0;
  }
  if (outcome !== "held" && outcome !== "failed") {
    console.error(`--set takes held or failed, not ${outcome}`);
    return 2;
  }
  const note = value("--note");
  const evidence = value("--evidence");
  const landed = store.tx((t) => recordVoiceProofIn(t, { outcome, ...(note === undefined ? {} : { note }), ...(evidence === undefined ? {} : { evidence }) }, { kind: "operator", id: "director" }));
  if (!landed.ok) {
    console.error(landed.error.message);
    return 2;
  }
  console.log(JSON.stringify(landed.value, null, 2));
  return 0;
}

process.exitCode = await main();
