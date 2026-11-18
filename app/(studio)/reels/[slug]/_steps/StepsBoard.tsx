"use client";

// The five steps as one column; the open one is the stage's, the rest folded to their state. While any of the
// reel's jobs is open the page re-reads itself every POLL_MS (router.refresh: the server component reads the
// port again, so the frame counter and the job states move without a socket). A fold the operator opened or
// closed stays as they left it across those re-reads.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { ReelDetail } from "../../_port/types.ts";
import { DataStep, type DataActs } from "./DataStep.tsx";
import { AuthorStep, RenderStep } from "./FilmSteps.tsx";
import { ReleaseStep, type ReleaseActs } from "./ReleaseStep.tsx";
import { SoundStep } from "./SoundStep.tsx";
import { StepPanel } from "./StepPanel.tsx";
import { isOpenJob, openStepOf, STEP_KEYS, stepState, type StepKey } from "./view.ts";
import s from "./Steps.module.css";

export const POLL_MS = 3000;

export type StepsActs = DataActs & ReleaseActs;

export function StepsBoard({ detail, acts, bedProblem }: { readonly detail: ReelDetail; readonly acts: StepsActs; readonly bedProblem?: string }) {
  const router = useRouter();
  const stageStep = openStepOf(detail.stage);
  const [open, setOpen] = useState<ReadonlySet<StepKey>>(() => new Set(stageStep === undefined ? [] : [stageStep]));
  const [seenStage, setSeenStage] = useState(detail.stage);
  // A new stage opens its step (the operator's folds stay otherwise).
  if (seenStage !== detail.stage) {
    setSeenStage(detail.stage);
    if (stageStep !== undefined && !open.has(stageStep)) setOpen(new Set([...open, stageStep]));
  }
  const running = detail.jobs.some(isOpenJob);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [running, router]);

  const toggle = (k: StepKey) => (next: boolean) => {
    const n = new Set(open);
    if (next) n.add(k);
    else n.delete(k);
    setOpen(n);
  };

  const body = (k: StepKey) => {
    switch (k) {
      case "data":
        return <DataStep detail={detail} acts={acts} />;
      case "author":
        return <AuthorStep detail={detail} launch={acts.launch} />;
      case "render":
        return <RenderStep detail={detail} launch={acts.launch} />;
      case "sound":
        return <SoundStep detail={detail} {...(bedProblem === undefined ? {} : { bedProblem })} />;
      case "release":
        return <ReleaseStep detail={detail} acts={acts} />;
    }
  };

  return (
    <div className={s.steps} data-component="ReelSteps">
      {STEP_KEYS.map((k) => (
        <StepPanel key={k} step={k} state={stepState(k, detail)} open={open.has(k)} onToggle={toggle(k)}>
          {body(k)}
        </StepPanel>
      ))}
    </div>
  );
}
