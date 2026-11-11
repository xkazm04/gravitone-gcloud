// The casting round for the robot-parody trailers (spark robot-parody-trailers, 2026-11-11).
//
//   npx tsx pipeline/parody/casting.mts build --out <dir> [--only film,film]
//   npx tsx pipeline/scout-codex.mts --queue <dir>/queue.json --out <dir> --workers 3
//
// `build` writes <dir>/queue.json (the item list scout-codex draws: five casting images per character, one chassis
// lens each) and <dir>/verdict.html (the page that picks one per character). Drawing is resumable; rebuild the page
// any time to see what has landed. Nothing here opens the store, a night or a channel card.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Lens = { readonly id: string; readonly name: string; readonly text: string };
type Character = { readonly id: string; readonly role: string; readonly brief: string; readonly rule: string };
type Film = { readonly id: string; readonly real: string; readonly trailer: string; readonly from: readonly string[]; readonly scene: string; readonly characters: readonly Character[] };
type Roster = { readonly world: { readonly name: string; readonly rule: string; readonly look: string }; readonly lenses: readonly Lens[]; readonly films: readonly Film[] };

const here = path.dirname(fileURLToPath(import.meta.url));
const roster = JSON.parse(fs.readFileSync(path.join(here, "roster.json"), "utf8")) as Roster;

const arg = (name: string): string | undefined => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
};
const out = path.resolve(arg("out") ?? "");
if (arg("out") === undefined || process.argv[2] !== "build") {
  console.error("usage: casting.mts build --out <dir> [--only film,film]");
  process.exit(2);
}
const only = arg("only")?.split(",");
const films = roster.films.filter((f) => only === undefined || only.includes(f.id));

// The same slug scout-codex uses for an item directory.
const slug = (id: string): string => id.replace(/[^A-Za-z0-9-]+/g, "_");

const prompt = (film: Film, c: Character, lens: Lens): string =>
  `${roster.world.look} Character: ${c.role}, in a parody of ${film.real} set in a robot world. ${c.brief} ${lens.text}`;

const items = films.flatMap((film, fi) => film.characters.map((c) => ({
  id: `${film.id}-${c.id}`,
  tier: fi + 1,
  title: `${film.trailer} · ${c.role}`,
  frames: roster.lenses.map((lens) => ({ name: lens.id, prompt: prompt(film, c, lens) })),
})));

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "queue.json"), JSON.stringify(items, null, 1));

const data = films.map((film, fi) => ({
  id: film.id, real: film.real, trailer: film.trailer, scene: film.scene,
  characters: film.characters.map((c) => ({ id: `${film.id}-${c.id}`, role: c.role, rule: c.rule, dir: `t${fi + 1}/${slug(`${film.id}-${c.id}`)}` })),
}));
const lenses = roster.lenses.map((l) => ({ id: l.id, name: l.name }));
const page = fs.readFileSync(path.join(here, "verdict.template.html"), "utf8")
  .replace("/*FILMS*/[]", JSON.stringify(data).replace(/</g, "\\u003c"))
  .replace("/*LENSES*/[]", JSON.stringify(lenses))
  .replace("{{WORLD}}", roster.world.name);
fs.writeFileSync(path.join(out, "verdict.html"), page);
console.log(`${items.length} characters, ${items.length * roster.lenses.length} images -> ${out}`);
