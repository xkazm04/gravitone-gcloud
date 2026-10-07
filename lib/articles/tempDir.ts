// A temp directory that is unique by construction.
//
// The run id is the date and the topic, and the engine's clock is injected, so
// `<id>-<ms>` names one directory for every process that runs the same topic in
// the same millisecond (a frozen test clock makes that certain). mkdtemp makes
// the name the file system's to guarantee: it appends a random suffix and
// creates the directory in one step, failing rather than reusing one that
// exists. This never removes anything. The prefix keeps `<id>-<name>-<ms>`
// readable, so a person can still find a leftover directory by its run.
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";

export async function uniqueDir(base: string, prefix: string): Promise<string> {
  await mkdir(base, { recursive: true });
  return mkdtemp(path.join(base, `${prefix}-`));
}
