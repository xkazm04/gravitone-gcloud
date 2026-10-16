import "server-only";

// The LibraryPort as the route receives it: the Server Actions, gathered on the server and handed
// to the client island as a prop (a reference per action crosses, never the module) - the
// Board's shape (../../board/_port/wire.ts).
import type { LibraryPort } from "./contract.ts";

import { detail, libraryAct, query } from "./actions.ts";

export const LIBRARY_PORT: LibraryPort = { query, detail, act: libraryAct };
