// a schema module: it defines its records with zod
import { z } from "zod";

export const qSchema = z.string();
export type Q = z.output<typeof qSchema>;
