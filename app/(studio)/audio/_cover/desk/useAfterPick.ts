"use client";

// AFTER THE PICK (./useCover.ts): the Suno remix brought back with its style, and the two style prompts back-filled.
// Every write is the server's; after one the view is re-read.
import { useState } from "react";

import type { CoverRecord } from "@gt/domain/cover";

import type { CoverActs } from "../contract.ts";
import type { CoverFlow } from "./coverFlow.ts";
import type { Sender } from "./send.ts";

export const failWords = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function useAfterPick(r: CoverRecord, acts: CoverActs, sender: Sender, refresh: () => void): Pick<CoverFlow, "remixError" | "remixBusy" | "sendRemix" | "stylesBusy" | "stylesError" | "stylesSaved" | "saveStyles"> {
  const [remixBusy, setRemixBusy] = useState(false);
  const [remixError, setRemixError] = useState<string | null>(null);
  const [stylesBusy, setStylesBusy] = useState(false);
  const [stylesError, setStylesError] = useState<string | null>(null);
  const [stylesSaved, setStylesSaved] = useState(false);

  const sendRemix = (file: File, remixStyle: string): void => {
    if (remixBusy) return;
    setRemixBusy(true);
    setRemixError(null);
    sender
      .remix({ id: r.id, file, style: remixStyle })
      .then((a) => {
        if (!a.ok) setRemixError(a.error);
        else refresh();
      }, (e: unknown) => setRemixError(failWords(e)))
      .finally(() => setRemixBusy(false));
  };

  const saveStyles = (src: string, remixStyle: string): void => {
    if (stylesBusy) return;
    setStylesBusy(true);
    setStylesError(null);
    setStylesSaved(false);
    const styles = { ...(src.trim() === "" ? {} : { sourceStyle: src.trim() }), ...(r.remix === undefined || remixStyle.trim() === "" ? {} : { remixStyle: remixStyle.trim() }) };
    acts
      .saveStyles(r.id, styles)
      .then((a) => {
        if (!a.ok) setStylesError(a.error.error);
        else {
          setStylesSaved(true);
          refresh();
        }
      }, (e: unknown) => setStylesError(failWords(e)))
      .finally(() => setStylesBusy(false));
  };

  return { remixError, remixBusy, sendRemix, stylesBusy, stylesError, stylesSaved, saveStyles };
}
