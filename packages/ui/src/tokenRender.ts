// Pure renderers: source -> the two committed outputs. Deterministic: groups keep their declared
// order, tokens within a group are sorted by name, no timestamps.
import type { TokenSource } from "./tokenSource.ts";

export const REGEN_COMMAND = "npm run tokens:gen";
export const SOURCE_PATH = "packages/ui/tokens/source.json";

const byName = <T extends { readonly name: string }>(a: T, b: T): number =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

export function renderCss(src: TokenSource): string {
  const out: string[] = [
    `/* GENERATED from ${SOURCE_PATH} by pipeline/gen-tokens.mts - do not edit.
`,
    `   Regenerate with: ${REGEN_COMMAND} */
`,
  ];
  out.push(":root {\n");
  src.groups.forEach((g, i) => {
    if (i > 0) out.push("\n");
    out.push(`  /* ${g.id} */\n`);
    for (const t of [...g.tokens].sort(byName)) {
      out.push(`  --${t.name}: ${t.value};${t.note ? ` /* ${t.note} */` : ""}\n`);
    }
  });
  out.push("}\n");
  return out.join("");
}

export function renderTs(src: TokenSource): string {
  const lines: string[] = [
    `// GENERATED from ${SOURCE_PATH} by pipeline/gen-tokens.mts - do not edit.`,
    `// Regenerate with: ${REGEN_COMMAND}`,
    "",
    "export const tokens = {",
  ];
  for (const g of src.groups) {
    lines.push(`  // ${g.id}`);
    for (const t of [...g.tokens].sort(byName)) {
      lines.push(`  ${JSON.stringify(t.name)}: ${JSON.stringify(t.value)},`);
    }
  }
  lines.push(
    "} as const;",
    "",
    "export type TokenName = keyof typeof tokens;",
    "",
    "/** The custom-property reference for a token, e.g. `var(--ink-bright)`. */",
    "export function cssVar(name: TokenName): string {",
    "  return `var(--${name})`;",
    "}",
    "",
  );
  return lines.join("\n");
}
