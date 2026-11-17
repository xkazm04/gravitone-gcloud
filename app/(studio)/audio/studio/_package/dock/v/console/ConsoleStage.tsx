"use client";

// DESIGN VARIANT "console" of the package stage (prototype dock-package) - a WORKING STUB with the final signature; a
// builder replaces it.
import { Wizard } from "../../../../../_release/wizard/Wizard.tsx";
import type { StageProps } from "../props.ts";

export function ConsoleStage({ read, session, newId, startStep }: StageProps) {
  return <Wizard read={read} session={session} newId={newId} {...(startStep === undefined ? {} : { startStep })} />;
}
