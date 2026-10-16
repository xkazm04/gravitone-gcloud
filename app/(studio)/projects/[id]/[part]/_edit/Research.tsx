"use client";

// The research part's three faces (STEPS-DESIGN §2): the notebook as a scope board (educational,
// free in facts mode), the beat variant board (trailer, free in beats mode), and the ads brief
// with its idea well. Which face is the view's `data.face`, decided on the server from the
// project's discipline; a free project may switch it (`set-face`, an op like any other).
import type { PartView } from "@gt/domain/partView";

import { AdsBriefEditor } from "./AdsBrief.tsx";
import { BeatsEditor } from "./Beats.tsx";
import { NotebookEditor } from "./Notebook.tsx";
import type { EditorProps } from "./PartEditor.tsx";

type V = PartView<"research">;

export function ResearchEditor(p: EditorProps<V>) {
  const d = p.view.data;
  if (d.face === "ads") return <AdsBriefEditor {...p} data={d} />;
  if (d.face === "beats") return <BeatsEditor {...p} data={d} />;
  return <NotebookEditor {...p} data={d} />;
}
