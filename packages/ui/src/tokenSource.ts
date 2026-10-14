// The schema door for packages/ui/tokens/source.json. Everything downstream (renderer, drift
// check, raw-value lint) consumes the parsed Source, never the raw text.
import { z } from "zod";

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

export type ParseResult =
  | { readonly ok: true; readonly value: TokenSource }
  | { readonly ok: false; readonly error: string };

export function parseSource(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `source.json is not JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  const parsed = sourceSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "),
    };
  }
  return { ok: true, value: parsed.data };
}

/** Every token name in the source: the allow-list a `var(--x)` must belong to. */
export function tokenNames(src: TokenSource): ReadonlySet<string> {
  return new Set(src.groups.flatMap((g) => g.tokens.map((t) => t.name)));
}
