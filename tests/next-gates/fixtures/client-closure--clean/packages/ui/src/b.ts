// CLEAN TWIN: the same type, spelled so the bundler erases the edge.
// import { z } from "zod";  <- a comment that names zod is not an edge
import type { Q } from "@gt/domain/rec";
import { ok } from "@gt/domain/ok";

export const b: Q = ok;
