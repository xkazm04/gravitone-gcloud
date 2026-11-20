// A step's job as one line: its state, its id, and its last error verbatim. Nothing when the step never ran one.
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { StatusPill } from "@gt/ui/components/status/StatusPill.tsx";

import type { ReelJobView } from "../../../../../lib/producers/reel.ts";
import s from "./Steps.module.css";

export function JobLine({ job }: { readonly job: ReelJobView | undefined }) {
  if (job === undefined) return null;
  return (
    <>
      <div className={s.row}>
        <StatusPill machine="job" state={job.state} />
        <span className={s.mono}>{job.jobId}</span>
      </div>
      {job.error !== undefined && <ErrorLine message={job.error} />}
    </>
  );
}
