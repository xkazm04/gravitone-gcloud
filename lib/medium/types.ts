// The Medium driver's wire types — pure, importable from either side of the
// client/server line. The driver itself (browser.ts, driver.ts) is server-only.

/** The dedicated profile's debugging port. Suno holds 9334, Leonardo 9333. */
export const MEDIUM_CDP_PORT = 9335;

export type MediumHealth = { ok: true } | { ok: false; reason: string };

export interface MediumFigure {
  /** File name, e.g. `01-pipeline.png`; the order of the array is the order in the story. */
  name: string;
  /** Absolute path of the PNG. */
  path: string;
}

export interface MediumDraftInput {
  title: string;
  subtitle?: string;
  /** The body: the `<body>` content of medium/story.html, without the title. */
  storyHtml: string;
  figures: MediumFigure[];
  /** The editor address of this run's earlier draft; its body is replaced. */
  existingUrl?: string;
  /** Absolute path the driver writes its PNG of the finished draft to. */
  shotPath: string;
}

export interface MediumDraftResult {
  url: string;
  /** Figures the editor accepted; fewer than `input.figures.length` is a result, not an error. */
  figures: number;
}

/** What the pipeline needs of Medium. Nothing here can publish. */
export interface MediumDriver {
  probe: () => Promise<MediumHealth>;
  createDraft: (input: MediumDraftInput) => Promise<MediumDraftResult>;
}
