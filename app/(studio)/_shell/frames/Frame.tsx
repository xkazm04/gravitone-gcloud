// A SECTION'S LOADING FRAME - the screen's own grid, drawn before its data, so nothing jumps when
// the data lands (each `loading.tsx` under app/(studio)). A frame is that section's layout classes
// read from its own CSS module, with `Ghost` marks where content will land.
//
// No visible word: the frame is marks only, and the busy state and the section's name are the
// non-visual channel. The root carries the section's root class, so the frame fills the studio
// frame exactly as the loaded screen does.
import type { ReactNode } from "react";

import { SrOnly } from "@gt/ui/components/a11y/SrOnly.tsx";

export function Frame({ name, className, children }: { readonly name: string; readonly className: string; readonly children: ReactNode }) {
  return (
    <div className={className} aria-busy="true" data-frame={name}>
      <SrOnly text={`${name} loading`} />
      {children}
    </div>
  );
}
