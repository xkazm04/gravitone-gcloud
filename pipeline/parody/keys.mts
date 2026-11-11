// Trailer keyframes for the robot-parody trailers (spark robot-parody-trailers, wave 2, 2026-11-11).
//
//   npx tsx pipeline/parody/keys.mts build --casting <casting dir> --verdicts <casting-verdicts.json> --out <dir>
//                                          [--only film,film] [--pick character=lens,...]
//   npx tsx pipeline/scout-codex.mts --queue <dir>/queue.json --out <dir> --workers 3
//
// shots.json holds eight shots per trailer, each drawn in three variants; every frame attaches the PICKED casting
// image of each character in it, so the cast holds across a trailer. `--pick` stands in for a character the operator
// sent back for a re-roll (its verdict has no pick); a shot whose cast has no image is left out and named.
// `motion` is not drawn: it is the H3 clip's line (speech, then "Sound: ... No music."), carried for the clip plan.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Shot = { readonly id: string; readonly label: string; readonly who: readonly string[]; readonly scene: string; readonly motion: string };
type Variant = { readonly id: string; readonly name: string; readonly text: string };
type Shots = { readonly frame: string; readonly variants: readonly Variant[]; readonly films: readonly { readonly id: string; readonly look: string; readonly shots: readonly Shot[] }[] };
type Character = { readonly id: string; readonly role: string; readonly brief: string; readonly human?: boolean };
type Roster = { readonly films: readonly { readonly id: string; readonly real: string; readonly trailer: string; readonly scene: string; readonly characters: readonly Character[] }[] };
type Verdicts = { readonly verdicts: Record<string, { readonly pick: string | null }> };

const here = path.dirname(fileURLToPath(import.meta.url));
const read = <T,>(p: string): T => JSON.parse(fs.readFileSync(p, "utf8")) as T;
const arg = (name: string): string | undefined => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
};
const [casting, verdictsFile, outArg] = [arg("casting"), arg("verdicts"), arg("out")];
if (process.argv[2] !== "build" || casting === undefined || verdictsFile === undefined || outArg === undefined) {
  console.error("usage: keys.mts build --casting <dir> --verdicts <json> --out <dir> [--only film,film] [--pick character=lens,...]");
  process.exit(2);
}
const out = path.resolve(outArg);
const shots = read<Shots>(path.join(here, "shots.json"));
const roster = read<Roster>(path.join(here, "roster.json"));
const verdicts = read<Verdicts>(verdictsFile).verdicts;
const overrides = new Map((arg("pick") ?? "").split(",").filter(Boolean).map((kv) => kv.split("=") as [string, string]));
const only = arg("only")?.split(",");

const slug = (id: string): string => id.replace(/[^A-Za-z0-9-]+/g, "_");
// The casting run's item directory for a character: tier is the film's place in the roster.
const castImage = (filmIndex: number, id: string): string | undefined => {
  const lens = overrides.get(id) ?? verdicts[id]?.pick ?? undefined;
  if (lens === undefined || lens === null) return undefined;
  const p = path.resolve(casting, `t${filmIndex + 1}`, slug(id), `${lens}.png`);
  return fs.existsSync(p) ? p : undefined;
};

const items: { id: string; tier: number; title: string; frames: { name: string; prompt: string; refs: string[] }[] }[] = [];
const pageFilms: unknown[] = [];
const left: string[] = [];
roster.films.forEach((film, fi) => {
  if (only !== undefined && !only.includes(film.id)) return;
  const plan = shots.films.find((f) => f.id === film.id);
  if (plan === undefined) { left.push(`${film.id}: no shots`); return; }
  const rows: unknown[] = [];
  for (const shot of plan.shots) {
    const cast = shot.who.map((w) => ({ c: film.characters.find((c) => c.id === w), img: castImage(fi, `${film.id}-${w}`) }));
    const missing = cast.filter((x) => x.c === undefined || x.img === undefined).map((_, i) => shot.who[i]);
    if (missing.length > 0) { left.push(`${film.id}-${shot.id}: no casting image for ${missing.join(", ")}`); continue; }
    const lead = cast.map((x, i) => `Image ${i + 1} is ${x.c!.role}: take only this character's build, materials, paint, costume and face design from it, never its pose, backdrop or framing.`).join(" ");
    const human = cast.some((x) => x.c!.human === true) ? "" : " Every figure is a robot; no human skin, hair or faces.";
    const id = `${film.id}-${shot.id}`;
    items.push({
      id, tier: fi + 1, title: `${film.trailer} · ${shot.label}`,
      frames: shots.variants.map((v) => ({
        name: v.id,
        prompt: `${lead} ${shots.frame} This is ${film.trailer}, the robot world's ${film.real}. ${plan.look} ${shot.scene}${human} ${v.text}`.replace(/\s+/g, " ").trim(),
        refs: cast.map((x) => x.img!),
      })),
    });
    rows.push({ id, role: `${shot.id.slice(1)} · ${shot.label}`, rule: shot.motion, dir: `t${fi + 1}/${slug(id)}` });
  }
  pageFilms.push({ id: film.id, real: film.real, trailer: film.trailer, scene: film.scene, characters: rows });
});

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "queue.json"), JSON.stringify(items, null, 1));
const page = fs.readFileSync(path.join(here, "verdict.template.html"), "utf8")
  .replace("/*FILMS*/[]", JSON.stringify(pageFilms).replace(/</g, "\\u003c"))
  .replace("/*LENSES*/[]", JSON.stringify(shots.variants.map((v) => ({ id: v.id, name: v.name }))))
  .replaceAll("{{TITLE}}", "Trailer keyframes")
  .replace("{{KEY}}", "parody-keys-1");
fs.writeFileSync(path.join(out, "verdict.html"), page);
console.log(`${items.length} shots, ${items.length * shots.variants.length} frames -> ${out}`);
for (const l of left) console.log(`left out: ${l}`);
