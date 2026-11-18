// The reel's step panels (spark reel-studio WP4): data, author, render, sound, release. A server component; the
// reel page (WP3) mounts it beside the review and hands it the detail. WP-0 STUB: renders nothing until WP4.

import type { ReactNode } from "react";
import type { ReelDetail } from "../../_port/types";

export function Steps({ detail }: { readonly detail: ReelDetail }): ReactNode {
  void detail;
  return null;
}
