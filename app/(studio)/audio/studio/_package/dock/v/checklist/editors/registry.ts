// Which editor an item opens in the dialog (prototype dock-package, round 2, variant "checklist").
import type { ComponentType } from "react";

import type { EditorKey } from "../model.ts";
import { ArtistEditor, CreditsEditor, DateEditor, GenreEditor, LyricsEditor, SongwritersEditor, TitleEditor } from "./details.tsx";
import { ChannelEditor, PreviewsEditor, PromptEditor, SleeveEditor, SplitsEditor, StoresEditor } from "./other.tsx";
import { ProblemsEditor, ScheduleEditor, SlotsEditor, SuggestionsEditor } from "./review.tsx";
import { AiEditor, GeneratorEditor, LicenceEditor, PersonaEditor, ProvenanceEditor, TierEditor } from "./rights.tsx";
import { ShelfEditor, TrackEditor } from "./tracks.tsx";
import type { EditorProps } from "./types.ts";

export const EDITORS: Readonly<Record<EditorKey, ComponentType<EditorProps>>> = {
  title: TitleEditor,
  artist: ArtistEditor,
  genre: GenreEditor,
  date: DateEditor,
  songwriters: SongwritersEditor,
  credits: CreditsEditor,
  lyrics: LyricsEditor,
  ai: AiEditor,
  persona: PersonaEditor,
  licence: LicenceEditor,
  tier: TierEditor,
  generator: GeneratorEditor,
  provenance: ProvenanceEditor,
  track: TrackEditor,
  shelf: ShelfEditor,
  sleeve: SleeveEditor,
  prompt: PromptEditor,
  channel: ChannelEditor,
  stores: StoresEditor,
  previews: PreviewsEditor,
  splits: SplitsEditor,
  blocks: ProblemsEditor,
  warnings: ProblemsEditor,
  suggestions: SuggestionsEditor,
  slots: SlotsEditor,
  schedule: ScheduleEditor,
};

/** Editors that draw their own rule lines and suggestions (the stop-gap step components, the review's lists). */
export const SELF_CONTAINED: ReadonlySet<EditorKey> = new Set<EditorKey>(["sleeve", "previews", "splits", "blocks", "warnings", "suggestions"]);
/** Editors that need the dialog's wide panel. */
export const WIDE: ReadonlySet<EditorKey> = new Set<EditorKey>(["sleeve", "previews", "shelf", "track", "credits", "lyrics", "suggestions", "blocks", "warnings", "slots", "stores"]);
