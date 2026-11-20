// IMPORT-FOLDER - every audio file directly in a folder filed as a KEPT take in the sound store, so it sits on the
// release shelf (spark studio-to-release WP3). The CLI twin of the shelf's drop (app/(studio)/audio/_release/
// importActs.ts): the same door (lib/sound/takes.ts createTake), the same rules.
//
//   node pipeline/import-folder.mts --dir <folder> [--dry] [--real]
//
// EACH FILE: held to the take door's audio rule and its 60 MB cap, its length MEASURED by ffprobe before anything is
// filed (a file that does not decode is refused in ffprobe's words and no take is made), then filed kept, kind music,
// origin `import`, titled from its name (lib/sound/mv/store.ts trackTitle: a track number and `(main)` dropped, an
// instrumental kept a second name). The take's id is a digest of its bytes, so a second import of the same file finds
// the take already filed (createTake is idempotent by id) and says so. NOT RECURSIVE: a sub-folder is stems or old
// versions (lib/sound/mv/importFolder.ts, whose listing this reads).
//
// --dry measures and lists what would be filed and writes nothing. THE STORE IS NAMED, never assumed: without
// SOUND_STORE_DIR the script refuses unless --real says the operator's own store is meant; a temp sound store with the
// tracked ledger (SOUND_STORE_DIR set, SOUND_LEDGER_PATH not) is refused too - a kept take writes its verdict there.
//
//   Exit 0 every file filed (or already filed) · 1 a file was refused · 2 usage or could not run.
//
// PLAIN `node`: lib-hooks gives this process what Next gives the server.

import "./lib-hooks.mts";

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const value = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name: string): boolean => args.includes(name);
const USAGE = "usage: node pipeline/import-folder.mts --dir <folder> [--dry] [--real]";

const unknown = args.filter((a, i) => !["--dir", "--dry", "--real"].includes(a) && args[i - 1] !== "--dir");
const dirArg = value("--dir");
if (unknown.length > 0 || dirArg === undefined || dirArg.startsWith("--")) {
  console.error(`${USAGE}${unknown.length > 0 ? `  (unknown: ${unknown.join(" ")})` : ""}`);
  process.exit(2);
}
const dry = flag("--dry");
const soundDir = (process.env["SOUND_STORE_DIR"] ?? "").trim();
const ledger = (process.env["SOUND_LEDGER_PATH"] ?? "").trim();
if (!dry && soundDir === "" && !flag("--real")) {
  console.error("import-folder: name the sound store: SOUND_STORE_DIR=<dir> (and SOUND_LEDGER_PATH), --real for the operator's own, or --dry. Refusing to open the default store.");
  process.exit(2);
}
if (!dry && soundDir !== "" && ledger === "") {
  console.error(`import-folder: SOUND_STORE_DIR is ${soundDir} but SOUND_LEDGER_PATH is unset: a kept take would write its verdict into the tracked ledger. Set SOUND_LEDGER_PATH beside it.`);
  process.exit(2);
}

const { errorMessage } = await import("../packages/domain/src/errors.ts");
const { expandHome, trackFiles } = await import("../lib/sound/mv/importFolder.ts");
const { trackTitle } = await import("../lib/sound/mv/store.ts");
const { audioMime, createTake, MAX_UPLOAD_BYTES } = await import("../lib/sound/takes.ts");
const { storeRoot } = await import("../lib/sound/store.ts");
const { probeDurationS } = await import("../lib/sound/cover/cut.ts");

type ImportLine = { readonly file: string; readonly outcome: "filed" | "already" | "would-file" | "refused"; readonly takeId: string | null; readonly title: string; readonly durationS: number | null; readonly reason: string | null };

/** The take id a file's bytes file under: the same bytes, the same take. */
const takeIdOf = (bytes: Uint8Array): string => `st-${createHash("sha256").update(bytes).digest("hex").slice(0, 10)}`;

async function importOne(abs: string): Promise<ImportLine> {
  const name = path.basename(abs);
  const title = trackTitle(path.basename(name, path.extname(name)));
  const refused = (reason: string): ImportLine => ({ file: name, outcome: "refused", takeId: null, title, durationS: null, reason });
  const size = (await stat(abs)).size;
  if (size === 0) return refused(`${name} is empty`);
  if (size > MAX_UPLOAD_BYTES) return refused(`the file is ${Math.round(size / 1048576)} MB; takes are capped at ${MAX_UPLOAD_BYTES / 1048576} MB`);
  let mime: string;
  try {
    mime = audioMime(null, name);
  } catch (e) {
    return refused(errorMessage(e));
  }
  const d = await probeDurationS(abs);
  if (!d.ok) return refused(`${name} could not be read: ${d.error.message}`);
  const bytes = new Uint8Array(await readFile(abs));
  const takeId = takeIdOf(bytes);
  if (dry) return { file: name, outcome: "would-file", takeId, title, durationS: d.value, reason: null };
  try {
    const { take, created } = await createTake({ id: takeId, origin: "import", kind: "music", title, verdict: "kept", fileName: name, durationS: d.value }, { bytes, mime, name });
    return { file: name, outcome: created ? "filed" : "already", takeId: take.id, title: take.title, durationS: take.durationS, reason: null };
  } catch (e) {
    return refused(errorMessage(e));
  }
}

async function main(): Promise<number> {
  const dir = path.resolve(expandHome(dirArg ?? ""));
  const st = await stat(dir).catch(() => null);
  if (st === null || !st.isDirectory()) {
    console.error(`import-folder: there is no folder at ${dir}`);
    return 2;
  }
  const files = await trackFiles(dir);
  console.log(`${dry ? "dry: " : ""}${files.length} audio file${files.length === 1 ? "" : "s"} in ${dir} -> ${dry ? "nothing written" : storeRoot()}`);
  let refusedN = 0;
  for (const abs of files) {
    const l = await importOne(abs);
    if (l.outcome === "refused") refusedN++;
    const len = l.durationS === null ? "" : ` ${l.durationS.toFixed(1)} s`;
    console.log(`  ${l.outcome.padEnd(10)} ${l.file}${l.takeId === null ? "" : ` -> ${l.takeId}`} "${l.title}"${len}${l.reason === null ? "" : `: ${l.reason}`}`);
  }
  console.log(`${files.length - refusedN} of ${files.length} ${dry ? "would be filed" : "filed kept"}${refusedN > 0 ? `, ${refusedN} refused` : ""}`);
  return refusedN > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(`import-folder: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
  },
);
