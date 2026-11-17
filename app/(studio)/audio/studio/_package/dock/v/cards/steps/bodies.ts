// Which body fills the decision card at each step.
import type { ComponentType } from "react";

import type { StepId, StepProps } from "../../../../../../_release/wizard/steps.ts";
import { ChannelsBody } from "./Channels.tsx";
import { DetailsBody } from "./Details.tsx";
import { ExtrasBody } from "./Extras.tsx";
import { ReviewBody } from "./Review.tsx";
import { RightsBody } from "./Rights.tsx";
import { SleeveBody } from "./Sleeve.tsx";
import { TracksBody } from "./Tracks.tsx";

export const BODY: Readonly<Record<StepId, ComponentType<StepProps>>> = {
  tracks: TracksBody,
  details: DetailsBody,
  rights: RightsBody,
  sleeve: SleeveBody,
  channels: ChannelsBody,
  extras: ExtrasBody,
  review: ReviewBody,
};
