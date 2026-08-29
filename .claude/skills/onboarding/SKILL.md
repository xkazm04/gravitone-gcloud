---
name: onboarding
memory: none
category: workflow
description: "Answer, for the machine in front of you, the three questions a fresh clone actually has — what works with no configuration at all, what needs a key and which key, and what needs hardware this box may not have. Probes read-only first, reports a rung/posture/probe/remedy ladder in which every capability lands on one of three outcomes (reachable now · reachable after a named action · absent here and no key changes it), then sets up only what the operator chose, writing .env.local by append from pasted values only. Generic engine; per-repo capability table, vendor links and verification commands come from .claude/onboarding/config.md. Use on a fresh clone, on a second machine, when a teammate asks 'what do I need to run this', or when a feature is mysteriously missing and nobody knows whether it is a key, a flag or the hardware."
argument-hint: "[probe | report | setup | verify]"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
---

# Onboarding — what can this machine actually run

A newcomer clones a repo and has three questions, in this order:

1. **What works with no configuration at all?**
2. **What needs a key — and exactly which key, from where?**
3. **What needs hardware I may not have, or a posture this box cannot take?**

In most repos all three answers already exist, and none of them is reachable. They are scattered
across an `.env.example`, a handful of `isConfigured()` predicates, a capability matrix, a router's
plan table and a hardware guard — and nearly all of them are **server-side runtime predicates**:
they answer *after* you have configured enough to boot, which is exactly when you have stopped
needing to ask.

This skill turns those predicates into an answer you can get before the first `npm install` finishes.

---

## The five rules. None of them is a preference.

**R1 · The repo's predicates decide. This skill restates nothing.**
Never write "music needs `ELEVENLABS_API_KEY`" into this file, into the overlay's prose, or into a
message. Name the *predicate* and run it. A guide that hardcodes a variable name becomes one more
copy of a fact that already had copies, and copies drift — the day a variable is renamed, the guide
is the only place still saying the old name with total confidence, to the one person least able to
tell. If the repo has no predicate for something, say **that** ("nothing in this repo answers this;
I read it off `.env.example` and it may be stale") rather than inventing an authority.

**R2 · Posture and probe are two columns, never one verdict.**
"Is this kind of thing possible here?" and "is it installed and logged in?" are different questions
with different answers and different remedies. A box that *may* spawn a local binary but has none
installed needs an install. A box where policy forbids spawning needs a flag flipped, and telling
its operator to install a binary sends them to fix something that was never broken. Collapsing the
two is how a deliberate policy flag gets deleted by someone chasing a "missing binary" report.

**R3 · Three outcomes, never two.**
Every capability lands in exactly one of:

| | outcome | means |
|---|---|---|
| `OK` | **reachable now** | works on this machine, as checked out |
| `→` | **reachable after a named action** | name the action, the variable, and the vendor page the repo's own docs already link |
| `x` | **absent here** | no key changes it: wrong hardware, wrong posture, or a vendor feature with no equivalent — and say *why*, in the repo's own words |

A setup guide that sorts the world into configured/unconfigured implies everything is one key away.
It is not, and the disappointment lands later and harder.

**R4 · Secrets are handled, never generated, never echoed.**
This is a hard rule with one narrow exception, and it is not negotiable at the user's convenience.

- Write `.env.local` **only** from a value the user pasted in this session.
- **Back it up before touching it** (`.env.local.bak.<timestamp>`), and **append** — never rewrite,
  never reorder, never "tidy". Another tool's variable lives in that file too.
- Print **presence and at most last-4**. Never the value, not in a table, not in a confirmation,
  not in a summary, not in a commit message.
- **Never invent a credential and never suggest a plausible-looking one.** A fabricated key is worse
  than an empty one: an empty variable fails closed with a readable message, and a wrong one fails
  as an auth error nobody attributes to this session.
- **Never commit `.env.local`.** Check it is gitignored before writing; if it is not, stop and say so.
- **THE ONE EXCEPTION:** a *locally-chosen shared secret* — a value the operator picks, that no
  vendor issues and no account is attached to. You may OFFER to generate one. If the repo pairs it
  with a public/client twin, **write both in the same step**: a gate that fails closed stays closed
  when only half the pair exists, and half-configured is the most confusing state there is.

**R5 · Spend nothing that was not authorised.**
Checking whether a key is **set** is not checking whether it is **valid**, and this skill only ever
does the first. Say so out loud in the report — "presence is not validity; a revoked key reads green
here and red on the first real call." Never make a vendor request, not even a free one, without
asking. If a check cannot be run without spending, report it as **unverified** with the command the
operator can run themselves. An honest "I could not check this" beats a confident guess every time.

---

## Cheapest working thing first

Order everything — the report, the questions, the setup steps — by **cost to value**, not by
architectural tidiness:

1. **Zero-config.** Whatever runs with no accounts and no credentials. This is almost always
   under-advertised, and it is the single most useful thing a newcomer can be told first.
2. **Free-but-installed.** A local binary already on the machine, a subscription seat the operator
   already pays for.
3. **Locally-chosen secrets.** Gates and shared secrets — free, instant, no account.
4. **Metered vendors.** One at a time, each with its own account and its own bill.
5. **Hardware-gated.** Last, because it is the one nothing can be done about tonight.

Someone who only wanted to look around is **done after step one**, and must be told so explicitly
rather than left scrolling a list they assume is mandatory.

---

## The overlay

`SKILL.md` is the method. `.claude/onboarding/config.md` is **this repo's** facts. Same split as the
`spark`, `perfect` and `ship-loop` skills. Read the overlay at Phase 0; if it is absent, run the
generic fallback below and say which mode you are in.

The overlay declares:

- `preflight` — the command that prints this repo's own capability reading, and its `--json` form.
  **If the repo has one, it is the authority and this skill does not second-guess it.**
- `zero_config` — what runs with no credentials, and the exact flag that unlocks it.
- `ladder` — the rungs, in cost order, each naming the predicate that decides it.
- `absent_by_design` — capabilities no key will reach here, and where their reason is written.
- `vendors` — per credential: the variable, the account, and the page **the repo's own docs link**.
- `verify` — the repo's own checks, split into `free` and `spends`.
- `record` — where a dated note goes so a second machine resumes instead of re-deriving.
- `never_touch` — files this skill must not write.

---

## Phases

### Phase 0 · Detect — *reads only*

- Stack and package manager; the lockfile; the engines field.
- `.env.example` (or equivalent) — parse it as **documentation**: the comment block above each
  variable is the remedy text, already written by whoever knows. Quote it; do not paraphrase it.
- An existing `.env.local` — **read which keys are present, never their values.** If it exists,
  this is a re-run or a partly-configured machine; the report must reflect that rather than
  addressing a virgin clone.
- The overlay. Announce `overlay: found` or `overlay: none — generic mode`.

### Phase 1 · Probe — *reads only, writes nothing, spends nothing*

Run the repo's `preflight` if it declared one. Otherwise, generically:

- runtime version vs the repo's declared floor; OS and architecture
- each local binary the repo can use: does it answer `--version`? **Record the ceiling honestly** —
  a version probe proves a binary runs, it does not prove there is a usable credential behind it.
- hardware, in dependency order. **Probe the cheap prerequisite before the expensive tool that
  assumes it** — a guard script that shells out to a driver tool will crash rather than report on a
  machine that has no driver, and a crash is not a reading.
- which variables are set — **presence only**.

Nothing is written in this phase. If the user stops here they have lost nothing and learned the map.

### Phase 2 · Report — the ladder

Two blocks, then the table:

```
POSTURE — what this deployment ALLOWS (config, flags, platform)
PROBE   — what was MEASURED here (never folded into the posture above)
```

Then one row per capability, in cost order:

```
     CAPABILITY            POSTURE (allowed)          PROBE (measured)
 OK  <name>                <flag/platform/plan>       <what was found>
 →   <name>                ...                        ...
 x   <name>                ...                        ...
```

Then, in this order: **reachable now** (so the win is stated first) · **after a named action**
(numbered, cheapest first, each with variable, vendor page and the predicate that decides it) ·
**absent here** (each with its reason, quoted from where the repo wrote it).

Close with the counts and the honesty line: nothing was spent, no vendor was contacted, and a key
that is set is not a key that is valid.

### Phase 3 · Choose — one `AskUserQuestion`

Ask **once**, multi-select, options ordered cheapest-first.

- The **default and first option is the zero-config path**, described by what it actually gives —
  not "minimal setup" but the list of things that work.
- Every metered option carries its cost shape in the description ("your own vendor bill, per call").
- Every hardware-gated option that this machine **failed** is offered as *disabled/unavailable* with
  its reason, not silently dropped. A newcomer who cannot see the row assumes it does not exist.
- Offer "just the report, set nothing up" as a real choice, and honour it.

### Phase 4 · Set up — only what was chosen

Per chosen capability, in cost order:

1. Name the account or install needed, in one sentence.
2. Give the page **the repo's own docs link**. If the repo links nothing, say "this repo does not
   document a page for this" rather than supplying a URL from memory.
3. Ask for the value. **Wait for a paste.** Do not proceed on an assumption, do not offer a sample,
   do not fill a placeholder.
4. Back up `.env.local`, append the variable(s), confirm with presence and last-4 only.
5. For a paired public/private secret, write **both halves in the same step** (R4).

If the user declines to paste something, that capability stays `→` and the report says so. A
half-written `.env.local` is worse than an unwritten one.

### Phase 5 · Verify — spending nothing unauthorised

Run the overlay's `free` checks and report what each proved. For anything in `spends`, do **not**
run it: print the command, say what it would cost, and mark the capability **unverified**.

Re-run the preflight so the closing table is a measurement rather than an expectation.

Then say plainly what is still unproven — typically: every key is present but no key is proven live.
Nothing in this skill's output may imply otherwise.

### Phase 6 · Record

Write a dated note to the overlay's `record` path (default `.vault/Onboarding/<date>-<host>.md`):

- what the machine was: OS, arch, runtime, hardware findings
- which outcome each capability landed on, and why
- which variables were set (**names only, never values, never last-4 in a file that will be read by
  someone else**)
- what could not be verified, and the command that would verify it
- discrepancies found (below)

A second machine reads this and resumes. Without it, the next operator re-derives everything, and
re-derivation is where wrong answers get invented.

---

## Discrepancies are reported, never silently corrected

If `.env.example` disagrees with the code — a variable the code reads but the example never
declares, a comment naming three gated routes when the code gates nine — **report it as a finding**
with both locations. Do not fix it as a side effect of onboarding someone.

Two reasons, and the second is the important one. A doc fix buried in a setup session is a change
nobody reviewed. And a silent correction destroys the evidence that the two had drifted at all,
which was the genuinely valuable thing this pass found.

The same applies to any bug the probes trip over in a file outside this skill's scope: report the
file, the symptom, the command that reproduces it. Do not fix it here.

---

## Generic mode — no overlay

Everything above still runs; only the inputs change.

- **Zero-config** = whatever the repo boots with when every variable in `.env.example` is empty.
  Actually try it (`dev` with an empty environment, in a scratch copy of the env) rather than
  assuming — the answer is usually better than the README claims.
- **Ladder** = one rung per credential group in `.env.example`, ordered by how the file itself
  orders them, since that ordering usually encodes the author's own sense of what matters.
- **Remedies** = the comment block above each variable, quoted.
- **Absent-by-design** = only what the repo says is absent. In generic mode, do not infer it —
  "I found no statement about this" is the honest row.
- **Verify** = the `scripts` block: anything named `typecheck`/`lint`/`test`/`check:*` is `free`;
  anything that names a vendor, a live endpoint or a spend flag goes in `spends` and is not run.

Say which mode you ran in. A generic-mode report is a weaker claim, and it must read like one.

---

## Failure modes this skill exists to prevent

- **"Everything is one key away."** It is not, and the operator finds out after buying a key.
- **A fourth copy of a variable name.** Fixed by R1 — the repo's predicates answer, or nobody does.
- **"Binary missing" for a policy flag.** Fixed by R2 — two columns.
- **A generated placeholder key.** Fixed by R4 — a fabricated credential fails as an auth error
  nobody traces back to this session.
- **A green report from a probe that proved nothing.** Fixed by R5 — presence is not validity, and
  the report says so in its own closing line.
- **Silence about the free path.** The single most useful sentence in most repos is the one nobody
  puts first. Put it first.
