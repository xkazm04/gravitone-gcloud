// WHERE A TRIAL LANDS IN THE REGISTRY, and how the post cites it. Pure.
//
// A trial's measurement becomes an APPLICATION of the technique under test, in the registry's
// own convention (`<subject dir>/applications/<stack>--<technique>.md`, frontmatter `applied`,
// `ab_verdict`, `proof`). The post cites that file as source 1, by its address on the
// registry's default branch: the address is known before the draft is written, while the
// publication's own slug is chosen only at landing (registryWrite.ts). Like the-token-tax's
// own SOURCES.md#experiments, the link resolves once the landing PR merges.

import { ArticleError } from "../store";
import type { ArticleTrialRef, Source, TrialPrereg, TrialVerdict } from "../types";

const SLUG = /[^a-z0-9-]+/g;
const clean = (s: string) => s.toLowerCase().replace(SLUG, "-").replace(/^-+|-+$/g, "");

/** `knowledge/<...>/<subject>/<subject>.md` + stack + technique ->
 *  `knowledge/<...>/<subject>/applications/<stack>--<technique>.md` (forward slashes). */
export function trialApplicationPath(subjectFile: string, stack: string, technique: string): string {
  const file = subjectFile.replace(/\\/g, "/");
  const dir = file.slice(0, file.lastIndexOf("/"));
  if (!dir.startsWith("knowledge/")) throw new ArticleError(`not a registry subject file: ${subjectFile}`, 400, "bad-subject-file");
  const st = clean(stack);
  const tq = clean(technique);
  if (!st || !tq) throw new ArticleError(`a trial needs a stack and a technique (got ${JSON.stringify(stack)}, ${JSON.stringify(technique)})`, 400, "bad-prereg");
  return `${dir}/applications/${st}--${tq}.md`;
}

/** `registry.remote` as `.ai/manifest.yaml` spells it (`github:owner/repo`, an https or ssh
 *  GitHub URL) -> `owner/repo`, or undefined when it is not a GitHub address. */
export function githubRepoOf(remote: string | undefined): string | undefined {
  const r = remote?.trim();
  if (!r) return undefined;
  const m =
    /^github:([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(r) ??
    /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(r) ??
    /^git@github\.com:([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(r);
  return m?.[1];
}

/** Source 1 of a trial run: the trial's application record, on the registry's default branch. */
export function experimentSource(
  ref: Pick<ArticleTrialRef, "id" | "applicationPath" | "n" | "metric" | "alternative">,
  prereg: Pick<TrialPrereg, "arms">,
  verdict: Pick<TrialVerdict, "at">,
  registryRemote: string | undefined,
  branch = "main",
): Source {
  const repo = githubRepoOf(registryRemote);
  if (!repo) throw new ArticleError(`registry.remote ${JSON.stringify(registryRemote ?? "")} is not a GitHub address; a trial run cites its record there`, 500, "no-registry-remote");
  return {
    n: 1,
    url: `https://github.com/${repo}/blob/${branch}/${ref.applicationPath}`,
    title: `Trial ${ref.id}: ${ref.metric}, ${prereg.arms[0].label} against ${ref.alternative} (n=${ref.n} per arm)`,
    publisher: "Gravitone article trial",
    date: verdict.at.slice(0, 10),
    primary: true,
    counter: false,
    took: `Every number measured first-hand for this post: ${ref.metric} for both arms, the guards and the controls, with the commands, versions and raw observations in the record.`,
  };
}
