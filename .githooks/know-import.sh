#!/bin/sh
# The know-how import after a pull (spark device-metadata-sync, KS2): shared by post-merge and post-checkout.
# Runs only when the pull changed knowhow/**, prints the summary or the error sentence, and NEVER fails the git
# operation (exit 0 always). It spends nothing and draws nothing: characters without pictures here are only queued,
# and the line it prints names `npm run know:redraw`.
#
# The kernel character store is written (`--real`) only outside an agent session: CLAUDECODE is set inside one, and a
# session never opens the operator's store (CLAUDE.md). There the import reaches the production's mirror only.
# $1 = the commit the operation started from (ORIG_HEAD for a merge, the previous HEAD for a checkout).

from="$1"
[ -n "$from" ] || exit 0
git rev-parse --verify --quiet "$from" >/dev/null 2>&1 || exit 0
changed=$(git diff --name-only "$from" HEAD -- knowhow/ 2>/dev/null | head -1)
[ -n "$changed" ] || exit 0

# the same unset as pre-push: a child must find its repository from its own working directory
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY \
  GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_NAMESPACE GIT_PREFIX

real="--real"
[ -n "$CLAUDECODE" ] && real=""
if [ -x node_modules/.bin/tsx ] || [ -f node_modules/.bin/tsx.cmd ]; then
  out=$(npx --no-install tsx pipeline/knowhow-import.mts import --quiet $real 2>&1)
  [ -n "$out" ] && printf '%s\n' "$out"
else
  echo "know:import skipped: tsx is not installed here (npm install, then npm run know:import)"
fi
exit 0
