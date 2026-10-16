// /projects/import - v1's browser projects into the kernel (Phase 4 wave D, L42; plan §6 Phase 4:
// "Browser projects arrive via the `.gravitone` archive ... becoming Projects, with their steps
// as Parts"). A static segment, so it wins over `[id]` (COMMON decision 11).
//
// The work happens in the browser that holds the rows: the island reads this origin's v1
// IndexedDB through v1's own `exportAccount`, verifies it through v1's own `inspectArchive`, and
// sends the archive to POST /api/import for the preview and the confirm. A `.gravitone` file from
// another machine takes the same road. Nothing is read on the server for this page.
import type { Metadata } from "next";

import { ImportView } from "./ImportView.tsx";

export const metadata: Metadata = { title: "Gravitone · Import" };

export default function ImportPage() {
  return <ImportView />;
}
