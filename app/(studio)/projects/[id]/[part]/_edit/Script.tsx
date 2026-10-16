"use client";

// The script part's three faces (STEPS-DESIGN §2): the adopted candidate as a beat document with
// its gate (educational, free in facts mode), the trailer cut with its structure check (trailer,
// free in beats mode), and the ad's scenario cards. The face is the view's `data.face`.
import type { PartView } from "@gt/domain/partView";

import { DocumentEditor } from "./Document.tsx";
import type { EditorProps } from "./PartEditor.tsx";
import { ScenariosEditor } from "./Scenarios.tsx";
import { TrailerEditor } from "./Trailer.tsx";

type V = PartView<"script">;

export function ScriptEditor(p: EditorProps<V>) {
  const d = p.view.data;
  if (d.face === "ads") return <ScenariosEditor {...p} data={d} />;
  if (d.face === "trailer") return <TrailerEditor {...p} data={d} />;
  return <DocumentEditor {...p} data={d} />;
}
