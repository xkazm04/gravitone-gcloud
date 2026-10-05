"use client";

// THE MUSIC-VIDEO DISCIPLINE'S RESEARCH — one mp3, one optional style line,
// one baked envelope. Shaped like `beats/useBeatPicks.ts`: hydrate once per
// project, never write before hydration, and the act that marks the project
// researched is explicit rather than inferred from a field changing shape.
//
// WHY THE RESEARCH RECORD IS A SEPARATE WRITE FROM THE SOURCE RECORD. Script's
// gate (ScriptStep.tsx's `ExplainerScript`) reads `loadStep(projectId,
// "research")` → `ResearchStepData.researched`, the SAME record every other
// discipline's research marks done through (`beats/useBeatPicks.ts`'s
// `confirm()`, `guided/useEducationalResearch.ts`'s persistence effect). A
// music-video project has no topic and no notebook, so nothing else would ever
// write that record — without this hook doing it explicitly, Script would
// block forever on an upstream step that has, in every way that matters to
// THIS project, already finished its work. The composition data itself (the
// upload pointer, the style line, the envelope, and Frames'/WP3's later
// fields) lives in its own sibling key (`"music-video-source"`,
// stepStore.ts's `MusicVideoSourceStepData`) for the same cadence reason every
// other sibling key in that file gives: this record grows across several
// later work packages and must not share a key with the one-shot research
// gate.

import { useCallback, useState } from "react";

import { assetFromUpload, putUploads } from "@/lib/assets";
import { analyzeAudioEnvelope, AudioDecodeError, type AudioEnvelope } from "@/lib/audioEnvelope";

import {
  claimSaveSlot,
  loadStep,
  saveStep,
  type MusicVideoSourceStepData,
  type ResearchStepData,
  type SaveOutcome,
} from "../_shared/stepStore";
import { useStepFor } from "../_shared/useLoadFor";

const PHASE = "music-video-source";

export type AttachStatus = "idle" | "decoding" | "error";

export function useMusicVideoSource(projectId: string, uid: string | null) {
  const [sourceAssetId, setSourceAssetId] = useState<string | undefined>(undefined);
  const [style, setStyleState] = useState("");
  const [envelope, setEnvelope] = useState<AudioEnvelope | undefined>(undefined);
  const [fileName, setFileName] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<AttachStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const hydrated = useStepFor<MusicVideoSourceStepData>(projectId, PHASE, (saved) => {
    setSourceAssetId(saved?.sourceAssetId);
    setStyleState(saved?.style ?? "");
    setEnvelope(saved?.envelope);
  });

  /** Everything this hook has written so far — read before every write so a
   *  later save never clobbers a field a LATER work package (Frames' poster,
   *  the effects-studio's seed) has already filled in. */
  const write = useCallback(
    async (patch: Partial<MusicVideoSourceStepData>): Promise<SaveOutcome> => {
      const slot = claimSaveSlot(projectId, PHASE);
      const current = (await loadStep<MusicVideoSourceStepData>(projectId, PHASE)) ?? {};
      if (!slot.stillNewest()) return { ok: true, superseded: true };
      return saveStep<MusicVideoSourceStepData>(projectId, PHASE, { ...current, ...patch });
    },
    [projectId],
  );

  /** Mark the project researched — the one write Script's gate actually reads.
   *  Reads the existing record first so a project that already has a topic
   *  (unlikely for this discipline, but the same discipline against a
   *  re-attach) does not lose it. */
  const markResearched = useCallback(async (): Promise<SaveOutcome> => {
    const slot = claimSaveSlot(projectId, "research");
    const current = await loadStep<ResearchStepData>(projectId, "research");
    if (!slot.stillNewest()) return { ok: true, superseded: true };
    return saveStep<ResearchStepData>(projectId, "research", {
      topic: current?.topic ?? "",
      researched: true,
    });
  }, [projectId]);

  const setStyle = useCallback(
    (text: string) => {
      setStyleState(text);
      void write({ style: text });
    },
    [write],
  );

  /** Drop an mp3: write the upload pointer, bake its envelope, persist both —
   *  then (and only then) mark research done. A decode failure stops here,
   *  honestly: no upload pointer without bytes that actually decode would
   *  leave the step store claiming a track that cannot be rendered against. */
  const attach = useCallback(
    async (files: FileList | File[]) => {
      const file = "length" in files ? files[0] : undefined;
      if (!file || !uid) return;

      setStatus("decoding");
      setError(null);
      setFileName(file.name);

      let env: AudioEnvelope;
      try {
        env = await analyzeAudioEnvelope(file);
      } catch (e) {
        const message =
          e instanceof AudioDecodeError
            ? e.message
            : `"${file.name}" could not be analyzed — ${e instanceof Error ? e.message : String(e)}`;
        setStatus("error");
        setError(message);
        return;
      }

      // Persistence is part of the attach: the surface says "done" only once
      // the upload, the source record and the research gate are all on disk.
      // `putUploads` REJECTS on a storage failure; `saveStep` RETURNS
      // `{ok:false}` — both land on the same error state, and the envelope is
      // drawn only after they succeed.
      const failed = (why: string) => {
        setStatus("error");
        setError(`"${file.name}" was not attached — ${why}`);
      };
      const pair = assetFromUpload(uid, file, ["music-video", "source"], "audio");
      try {
        await putUploads([pair]);
      } catch (e) {
        failed(`the browser could not store the file (${e instanceof Error ? e.message : String(e)})`);
        return;
      }

      const saved = await write({ sourceAssetId: pair.asset.id, envelope: env });
      if (!saved.ok) {
        failed("the track's analysis could not be saved");
        return;
      }
      const gated = await markResearched();
      if (!gated.ok) {
        failed("the project could not be marked researched");
        return;
      }

      setSourceAssetId(pair.asset.id);
      setEnvelope(env);
      setStatus("idle");
    },
    [uid, write, markResearched],
  );

  const clearError = useCallback(() => {
    setStatus("idle");
    setError(null);
  }, []);

  return {
    hydrated,
    sourceAssetId,
    style,
    envelope,
    fileName,
    status,
    error,
    setStyle,
    attach,
    clearError,
  };
}

export type MusicVideoSourceApi = ReturnType<typeof useMusicVideoSource>;
