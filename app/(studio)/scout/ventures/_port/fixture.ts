import "server-only";

// The scripted ventures slate: an imported channel with a production and an accepted lesson, and a proven-video venture with none yet.

import type { ProductionId } from "@gt/domain/production";

import type { VenturesView } from "./contract.ts";

export function fixtureVentures(): VenturesView {
  return {
    ventures: [
      {
        id: "vn-while-it-works",
        name: "While It Works",
        kind: "channel",
        ground: "channel",
        proposal: "channel/F1",
        frame: { tone: "Documentary", audience: "Curious adults 18-45", format: "a drawn storyboard episode", look: "Macro cinematography of real objects in use.", genres: [] },
        bornAt: "2026-11-09T09:00:00Z",
        channelId: "F1",
        channel: { id: "F1", group: "Documentary", name: "While It Works", audience: "Curious adults 18-45", promise: "A camera that goes where no camera can.", gap: "A short, photoreal cutaway was not found.", edge: "Each view is graded and labelled.", medium: "storyboard", look: "Macro cinematography of real objects in use." },
        productions: [{ id: "prdn:archivist" as ProductionId, title: "The Archivist", stage: "done" }],
        lessons: [{ id: "lesson-technique", dimension: "technique", text: "A locked camera survives the first-last-frame handoff.", production: "The Archivist", drawnFrom: 1 }],
      },
      {
        id: "vn-harbour-tales",
        name: "Harbour Tales",
        kind: "channel",
        ground: "proven",
        proposal: "production/prdn:salt-road",
        frame: { tone: "dry, unhurried", audience: "long-form viewers", format: "a 16:9 video", look: "cold harbour light", genres: [] },
        bornAt: "2026-11-09T09:00:00Z",
        productions: [],
        lessons: [],
      },
    ],
  };
}
