# Challenge deck 2026-10-10 - 12 cards, 0 void, 0 premise-false, 0 excluded
Ranked by impact x critic mean (A/G/F). Every "revise" carries the critic's one change (critic.json), applied in the builder brief.

| # | card | size | i/r | gate | files | critic |
|---|------|------|-----|------|-------|--------|
| 1 | imaging-service/A  Only a free call may be retried: one billed-attempt rule | M | 8/5 | policy-tighten | 7 | revise 4/5/4 - drop 503->rate-limited remap |
| 2 | foundry-engine/A  One verdict kernel for four gates: keyed PATCH, run-locked | L | 8/6 | contract (in-tree) | 15->16 | revise 4/5/4 - +3 files, unlocked inner write |
| 3 | script-phase/B  Walkable version history: staged runs survive reload | M | 8/5 | none | 10 | revise 4/5/3 - case 1 deep-equals v2 |
| 4 | probe-frame-data/B  C11 stage 1: shot clauses mint truth sidecars | M | 8/5 | architecture | 6 | revise 4/4/4 - +probe.py, real-row case |
| 5 | ui-shell/A  One layer stack: Modal, bell, account own Escape/outside/keys | L | 8/6 | architecture | 7 | revise 4/4/3 - defaultPrevented case, 13 callers |
| 6 | studio-workspace/B  The studio names your next move (shelf verb, one press) | M | 7/4 | direction (in scope) | 7 | build 3/5/4 |
| 7 | script-phase/A  Notes pad -> pure notebook-stamped state machine | M | 7/5 | architecture | 9 | revise 4/5/3 - wiring source check |
| 8 | probe-frame-data/A  Lane parameters declared once | M | 7/5 | architecture | 5 | revise 3/5/4 - case 5 rewritten |
| 9 | foundry-engine/B  Extract runs meter their own spend | M | 7/5 | none | 6 | revise 3/4/5 - premise 5 reworded |
| 10 | ui-shell/B  Storage trouble becomes a remedy | M | 8/5 | none | 4 | revise 3/4/3 - clear same op/project/phase only |
| 11 | studio-workspace/A  Studio navigation through one door | M | 7/5 | architecture | 7 | revise 4/4/3 - router.replace source check |
| 12 | imaging-service/B  A paid render outlives its request: keyed receipts | M | 7/5 | contract (in-tree) | 8 | revise 4/3/4 - persist key + reload case, or strike claim |

Waves (disjoint write sets, A before B on every shared pair):
- W1: ui-shell/A, script-phase/A, foundry-engine/A, studio-workspace/A
- W2: ui-shell/B, script-phase/B, foundry-engine/B, imaging-service/A
- W3: studio-workspace/B, imaging-service/B, probe-frame-data/A
- W4: probe-frame-data/B
app/kit/census.json: coordinator-owned; builders do NOT regenerate (foreign in-flight tree would be baked in).
