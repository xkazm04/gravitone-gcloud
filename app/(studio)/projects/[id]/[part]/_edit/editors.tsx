"use client";

// THE LATER EDITORS (Phase 4 wave C, L39 + L40): the part kinds after research and script, one
// line per kind, so the island (./PartEditor.tsx) routes to an editor without a third arm on its
// research|script choice. The server-side twin is ../../_part/kinds.ts.
import { createElement, type ComponentType } from "react";

import type { EditorKind, PartView } from "@gt/domain/partView";

import type { EditorProps } from "./PartEditor.tsx";
/* L39 */
import { FramesEditor } from "./Frames.tsx";
import { MotionEditor } from "./Motion.tsx";
/* L40 */
import { ArticleEditor } from "./Article.tsx";
import { CutEditor } from "./Cut.tsx";
import { RenderEditor } from "./Render.tsx";
import { ScoreEditor } from "./Score.tsx";
import { StripsEditor } from "./Strips.tsx";
import { VoiceEditor } from "./Voice.tsx";
import { WordsEditor } from "./Words.tsx";

export type LaterKind = Exclude<EditorKind, "research" | "script">;
type Editors = { readonly [K in LaterKind]: ComponentType<EditorProps<PartView<K>>> };

/** One line per kind. */
const EDITORS: Editors = {
  /* L39 */
  frames: FramesEditor,
  motion: MotionEditor,
  /* L40 */
  score: ScoreEditor,
  cut: CutEditor,
  words: WordsEditor,
  render: RenderEditor,
  article: ArticleEditor,
  strips: StripsEditor,
  voice: VoiceEditor,
};

function editorOf<K extends LaterKind>(kind: K): ComponentType<EditorProps<PartView<K>>> {
  return EDITORS[kind];
}

export function LaterEditor(p: EditorProps<PartView<LaterKind>>) {
  // A module-level component picked by kind (stable identity), so createElement, not a JSX tag
  // the static-components rule would read as a component made during render.
  return createElement(editorOf(p.view.kind), p);
}
