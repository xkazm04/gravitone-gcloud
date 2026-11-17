"use client";

// DESIGN VARIANT "focus" of the package stage (prototype dock-package, round 2) - a WORKING STUB; a builder replaces it.
import { Wizard } from "../../../../../_release/wizard/Wizard.tsx";
import type { StageProps } from "../props.ts";

export function FocusStage({ read, session, newId, startStep }: StageProps) {
  return <Wizard read={read} session={session} newId={newId} {...(startStep === undefined ? {} : { startStep })} />;
}
