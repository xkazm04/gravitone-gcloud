import "server-only";

import type { z } from "zod";

import type { Parsed } from "@gt/domain/door";

import { runAction, type ActionBody, type ActionResult } from "./actionCore.ts";
import { principal } from "./principal.ts";

// action(schema, fn) - the one Server Action wrapper. Used from a "use server"
// module as
//
//   export const decide = action("decide", decideInput, async (input, who) => ...);
//
// which exports an async function, as a "use server" module must. The order,
// the door and the serialisable answer are actionCore.ts's; this file only
// binds the principal to the request's session cookie, with `money` key use.

export function action<S extends z.ZodType, T>(
  name: string,
  schema: S,
  body: ActionBody<Parsed<z.output<S>>, T>,
): (raw: unknown) => Promise<ActionResult<T>> {
  return (raw) => runAction(name, () => principal("money"), schema, body, raw);
}
