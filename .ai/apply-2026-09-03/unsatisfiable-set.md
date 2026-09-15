# unsatisfiable-set-empirical-gate — simulation, 2026-09-03

Registry: engineering-process/codebase-stewardship/dependency-declaration/techniques/unsatisfiable-set-empirical-gate
Seam: `.github/workflows/gates.yml:195-196` (`- name: install` / `run: npm ci`)
No product code changed.

A (today): `npm ci` is the authority. The lockfile pins exact versions and
integrity hashes; a lock that disagrees with `package.json` is itself a
failure, and this step is the only thing in the project that can see it
(`gates.yml:184-194`). Resolution is fully on.

B (technique): declare the set unsatisfiable, install with resolution disabled at
every install site, comment each override with the named conflict, and let the
end-to-end run of the built artifact stand in for the resolver's verdict — with
the consistency check declared expected-to-fail.

## Case 1 — `c0485d6`, "sync package-lock.json — the first CI run refused it, correctly"

The lock was missing `@emnapi/core` and `@emnapi/runtime` and pinned
`@emnapi/wasi-threads@1.2.1` against a range wanting `1.2.3`. Under A the
resolver refused and named the exact packages. Under B there is no resolver
verdict to refuse with: `npm install --no-package-lock` (or `--force`) would have
installed something, `next build` would then have failed on a missing
`@tailwindcss/oxide` binding, and the error surfaces one job step later as a
build failure whose text names a wasm module rather than a version range.
Prediction: B strictly delays and degrades the diagnosis here.

## Case 2 — `c640015`, "restore the two hoisted @emnapi entries npm-on-Windows prunes"

Five minutes after case 1, the same step went red again. The commit message
records the decision explicitly: "A from-scratch regeneration was worse: -930
lines… the two entries are re-added by hand (+22 lines, resolved + integrity
taken from the registry)… `npm ci` could not have succeeded on linux at any point
in this repo's history." The team hand-authored the exact working set and wrote
the reason at the install site (`gates.yml:184-194`, +10 lines in this same
commit) — which is *literally* the technique's mechanism, step 2, applied while
keeping the resolver on. Prediction: B's steps 2 and 4 were already taken here;
B's steps 1 and 3 would have removed the instrument that produced both reds.

## Case 3 — the declared-expectation pattern already exists, on a different gate

`pipeline/check-bundle.mjs` carries a `POSITIVE_CONTROL` (`:183`) and three exit
codes (`:34-40`) with `2` reserved for "could not run: no build to read, no
chunks, or the POSITIVE CONTROL was not found", plus a recorded false positive
from its first run (`:221`). That is the technique's "assert the instrument /
a green checker is an alarm" discipline, implemented, and it lives on the gate
that reads the *artifact*. So the repo has both halves of the technique — the
install-site comment and the instrument assertion — deployed against a
satisfiable graph. Prediction: nothing in the technique is missing from this
repo; what is missing from the technique is a statement of its precondition.

## Verdict: not-better, with a condition

The constraint set here **is satisfiable**. `npm ci` succeeds on Linux with a
correct lock; the failure was that `npm install` on the maintainer's Windows box
prunes platform-optional hoisted entries out of the lock it writes. That is a
lock-generation asymmetry, not an absence of a solution — the technique's own
"when not to use this: when a solution exists but is inconvenient".

**Condition gained:** before invoking this technique, prove unsatisfiability by
naming the mutually exclusive constraints. A resolver that is red because the
lock was generated on the wrong host looks identical to a resolver that is red
because no assignment exists, and the two have opposite correct treatments —
fix the lock, versus stop trusting the resolver. Applying the technique to the
first case deletes the only instrument that can tell them apart.

Note also that gravitone has **no** signing, attestation, provenance or
release workflow at all (`permissions: contents: read`, `gates.yml:161-162`), and
the absence of a supply-chain job is a recorded, argued decision
(`gates.yml:129-139`), not an oversight.
