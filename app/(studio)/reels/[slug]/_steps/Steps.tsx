// The reel's step panels (spark reel-studio WP4): data, author, render, sound, release. A server component; the
// reel page (WP3) mounts it beside the review and hands it the detail. It is the server parent the rule asks
// for: the Server Actions are imported here and handed to the client islands as props, so no client module
// imports an action file by value.
//
// The one judgement made here rather than in the islands is the bed's: lib/reel/film.ts `bedProblem` against
// the desktop film, so the sentence the attach would refuse with is the one the step shows.

import type { ReactNode } from "react";

import { bedProblem } from "@/lib/reel/film";

import { acceptTableAction, launchReelAction, savePublishAction, sendBackTableAction } from "../../_actions/steps.ts";
import type { ReelDetail } from "../../_port/types";
import { StepsBoard } from "./StepsBoard.tsx";

/** The attached bed's refusal sentence, or undefined when it fits (or there is nothing to measure yet). */
function bedSays(detail: ReelDetail): string | undefined {
  const bed = detail.film?.bed;
  const desktop = detail.film?.renders.desktop;
  if (bed === undefined || desktop === undefined) return undefined;
  try {
    return bedProblem(bed, desktop.seconds);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export function Steps({ detail }: { readonly detail: ReelDetail }): ReactNode {
  const problem = bedSays(detail);
  return (
    <StepsBoard
      detail={detail}
      acts={{ launch: launchReelAction, accept: acceptTableAction, sendBack: sendBackTableAction, savePublish: savePublishAction }}
      {...(problem === undefined ? {} : { bedProblem: problem })}
    />
  );
}
