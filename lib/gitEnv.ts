// The environment a git child process gets when it must act on the repository
// named by its `cwd` and on no other.
//
// Git locates its repository from these variables before it looks at the
// working directory. Inside a git hook they are set — a pre-push from a
// worktree exports GIT_DIR pointing at this checkout — and every process the
// hook starts inherits them: `npm run verify`, the probe lane, the article
// fixture, the landing code under test. A `git init --bare` or `git config
// user.email` aimed at a temp directory then lands on the checkout instead.
// Measured 2026-10-05: one pre-push turned this repository bare and set its
// committer to the fixture's identity. A landing `git push` would have gone
// out from the same inherited repository.
//
// tests/fixtures/articles/registry-fixture.mjs carries a copy of this list
// (an ES module run as a subprocess cannot import this file); the
// articles-git-env probe holds both to the same behaviour.

export const REPO_LOCATING_GIT_VARS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_NAMESPACE",
  "GIT_PREFIX",
  "GIT_CEILING_DIRECTORIES",
  "GIT_DISCOVERY_ACROSS_FILESYSTEM",
] as const;

/** `env` without the variables that would point git at another repository. */
export function cwdBoundGitEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...env };
  for (const k of REPO_LOCATING_GIT_VARS) delete out[k];
  return out;
}
