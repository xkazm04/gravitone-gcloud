"use client";

// The adoption record, held for one project — hydrate honestly, write on the
// click, and NEVER before hydration (the house rule `useScope` wrote down:
// writing the initial state over a stored record is the bug that silently
// emptied the job store).
//
// Unlike `useScope` there is no save-on-every-change effect here, and that is
// deliberate: adoption changes exactly when the creator picks or unpicks a
// card, so the save lives in the callback where the click is. An effect-shaped
// save would add a write on hydration — stamping `savedAt` onto a record the
// user did not touch — for no caller's benefit.

import { useCallback, useState } from "react";

import { saveStep, type ScriptAdoptionStepData } from "../../_shared/stepStore";
import { useStepFor } from "../../_shared/useLoadFor";
import { RENDER_BY_ID } from "../renders";
import { ADOPTION_PHASE } from "./adoption";

export function useAdoption(projectId: string) {
  /** The RAW stored value: `undefined` = key never written, `""` = explicitly
   *  cleared, anything else = a render id (possibly stale). Kept raw so the
   *  three states stay distinguishable — `everWritten` below needs the first
   *  two apart, and `adoptedId` needs the last one validated. */
  const [stored, setStored] = useState<string | undefined>(undefined);

  const hydrated = useStepFor<ScriptAdoptionStepData>(projectId, ADOPTION_PHASE, (data) => {
    setStored(data?.renderId);
  });

  /** What the surfaces treat as adopted: a stored id that still resolves.
   *  `""` and unknown ids read as "no adoption", exactly as the frames reader
   *  resolves them (see ./adoption.ts). */
  const adoptedId = stored && RENDER_BY_ID[stored] ? stored : null;

  /** Whether an adoption record exists at all — cleared included. Read by the
   *  face default: a creator who adopted and then un-adopted has still made a
   *  decision on this surface. */
  const everWritten = stored !== undefined;

  /** Pick a card (id) or unpick the picked one (null). `null` writes `""` —
   *  the cleared convention in ./adoption.ts — never a deletion, because the
   *  step store has no delete and absence must keep meaning "never adopted". */
  const adopt = useCallback(
    (id: string | null) => {
      if (!hydrated) return; // never save before hydration
      const renderId = id ?? "";
      setStored(renderId);
      void saveStep<ScriptAdoptionStepData>(projectId, ADOPTION_PHASE, { renderId });
    },
    [hydrated, projectId],
  );

  return { hydrated, adoptedId, everWritten, adopt };
}

export type AdoptionApi = ReturnType<typeof useAdoption>;
