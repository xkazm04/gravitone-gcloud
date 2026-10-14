// The schema door for packages/ui/tokens/source.json. Everything downstream (renderer, drift
// check, raw-value lint) consumes the parsed Source, never the raw text.
import { z } from "zod";
import { parseJsonAt } from "@gt/domain/door";
import type { Result } from "@gt/domain/errors";

const tokenName = z.string().regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, "kebab-case, no leading --");

const token = z.strictObject({
  name: tokenName,
  // A primitive is a value of the prototype's :root; a role is an admitted intent (ADMISSION.md).
  tier: z.enum(["primitive", "role"]),
  value: z.string().min(1),
  note: z.string().min(1).optional(),
});

const group = z.strictObject({
  id: tokenName,
  tokens: z.array(token).min(1),
});

const sourceSchema = z
  .strictObject({
    source: z.string().min(1),
    groups: z.array(group).min(1),
  })
  .superRefine((src, ctx) => {
    const seen = new Set<string>();
    for (const g of src.groups) {
      for (const t of g.tokens) {
        if (seen.has(t.name)) {
          ctx.addIssue({ code: "custom", message: `duplicate token name: ${t.name}` });
        }
        seen.add(t.name);
      }
    }
  });

export type TokenTier = "primitive" | "role";
export type TokenSource = z.infer<typeof sourceSchema>;

/** source.json through the one schema door: never throws, the failure names the field. */
export function parseSource(text: string): Result<TokenSource> {
  return parseJsonAt("tokens/source.json", sourceSchema, text);
}

/** Every token name in the source: the allow-list a `var(--x)` must belong to. */
export function tokenNames(src: TokenSource): ReadonlySet<string> {
  return new Set(src.groups.flatMap((g) => g.tokens.map((t) => t.name)));
}
