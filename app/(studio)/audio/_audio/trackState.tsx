"use client";

// FROM A TRACK - the third door (@gt/ui TrackDrop; POST /audio/reference measures the upload and
// keeps nothing). Its answer is read through a narrow check, ./returnClient.ts's way: a client
// module never loads zod.
import { useState, type ReactNode } from "react";

import { errorMessage } from "@gt/domain/errors";
import type { Level } from "@gt/ui/components/audio/shape.ts";
import { TrackDrop, type TrackRead } from "@gt/ui/components/audio/TrackDrop.tsx";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isLevel = (v: unknown): v is Level => v === 0 || v === 1 || v === 2 || v === 3;

function readOf(body: unknown): TrackRead | null {
  if (!isObject(body) || typeof body["name"] !== "string" || typeof body["durationS"] !== "number") return null;
  const bpm = body["bpm"];
  const key = body["key"];
  const levels = body["levels"];
  if (!(bpm === null || typeof bpm === "number") || !(key === null || typeof key === "string") || !Array.isArray(levels) || !levels.every(isLevel)) return null;
  return { name: body["name"], durationS: body["durationS"], bpm, key, levels };
}

export function useTrack(onUse: (read: TrackRead) => void): ReactNode {
  const [busy, setBusy] = useState(false);
  const [read, setRead] = useState<TrackRead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onFile = (file: File): void => {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("file", file, file.name);
    void fetch("/audio/reference", { method: "POST", body: form, credentials: "same-origin" })
      .then(async (res) => {
        const body: unknown = await res.json().catch(() => null);
        const r = res.ok ? readOf(body) : null;
        if (r !== null) setRead(r);
        else setError(isObject(body) && typeof body["error"] === "string" ? body["error"] : `HTTP ${res.status}, an unreadable answer`);
      })
      .catch((e: unknown) => setError(`the track did not reach the studio: ${errorMessage(e)}`))
      .finally(() => setBusy(false));
  };
  return <TrackDrop busy={busy} read={read} error={error} onFile={onFile} onUse={() => read !== null && onUse(read)} />;
}
