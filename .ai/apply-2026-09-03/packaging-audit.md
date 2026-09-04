# adoption-time-packaging-audit — run as an experiment, 2026-09-03

Registry: engineering-process/build-and-release/packaging/techniques/adoption-time-packaging-audit
No product code changed. Commands are reproducible from `node_modules/`.

## Instrument assertion (technique step 4 — "assert the instrument")

    grep -rlE "__dirname" eslint --include=*.js        -> 3 files
    grep -clE "__dirname" typescript/lib/typescript.js -> match

The search reads what it claims to read. The zeros below are real zeros.

## The audit, over the runtime closure that enters the transform

    for p in firebase @firebase motion lucide-react; do
      grep -rlE "__dirname|__filename" $p --include=*.js --include=*.mjs --include=*.cjs | wc -l
      grep -rlE "require\.resolve|require\(([^'\"\`)]|.*\+)" $p --include=*.js --include=*.cjs | wc -l
      grep -rlE "new Function\(|\beval\(" $p --include=*.js --include=*.mjs --include=*.cjs | wc -l
    done

| package      | js/mjs/cjs files | P3 abs-path resolution | P5 dynamic import by computed name | P1 reads own source |
|--------------|-----------------|------------------------|-----------------------------------|---------------------|
| firebase     | 133             | 0                      | 11 (all `firebase-*-compat.js`)   | 4                   |
| @firebase    | 154             | 1                      | 1                                 | 0                   |
| motion       | 16              | 0                      | 0                                 | 0                   |
| lucide-react | 2041            | 0                      | 0                                 | 0                   |

Closure: 326 top-level entries, 464 manifests.

The 11 firebase hits are confined to the `*-compat.js` CJS entry points, which
this app does not import (it imports the ESM `firebase/app` surface). Priced
shim cost across the whole closure: zero.

## Verdict: not-better, with a condition

The technique's five patterns all describe a **freeze**: a transform that ships
compiled units and no source, flattens the distribution boundary, and collects
code by following imports. Next/Turbopack's transform is a **browser/server
split** — it relocates modules across a trust boundary, it does not remove the
source tree or the package database from the runtime.

The real packaging failure this repo has recorded (`next.config.ts:19-34`,
measured 2026-08-30 on a real `npm run build`) is:

> a `"use client"` module imported by a Server Component is a client-reference
> entry point, emitted whether or not any branch reaches it

That is a sixth pattern the technique does not enumerate, it lives in the
product's OWN module (`app/_dev-inspector/`), not in a dependency's transitive
tree, and it is therefore invisible to an audit run at dependency-selection
time. The post-hoc gate `pipeline/check-bundle.mjs` — which reads the emitted
browser chunks and carries a POSITIVE_CONTROL and a distinct exit code 2 for
"could not run" — is what actually caught it, and remains the load-bearing gate.

**Condition gained:** the audit pays where the transform is a freeze
(PyInstaller, single-file bundlers, AOT). Where the transform is a
module-graph relocation, the hostile constructs are *reachability* constructs in
first-party code, and only a gate that reads the emitted artifact can see them.
