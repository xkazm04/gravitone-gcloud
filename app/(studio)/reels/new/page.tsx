// /reels/new - a reel from its idea (spark reel-studio WP4). A static segment, so it wins over `[slug]`. The
// server parent hands the create act to the form island as a prop.
import type { Metadata } from "next";

import { createReelAction } from "../_actions/create.ts";
import { NewReel } from "./NewReel.tsx";

export const metadata: Metadata = { title: "Gravitone · New reel" };

export default function NewReelPage() {
  return <NewReel create={createReelAction} />;
}
