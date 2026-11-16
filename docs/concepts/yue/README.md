# YuE2 song lab: what shipped, how to run it on another machine, and the game-audio experiment

**Status (2026-11-05): SHIPPED to local main as spark `yue2-song-lab` S1 + S2. One verification is still owed:
the uninterrupted live loop (step 0 below).** This file is the repo-side record, because the vault note
(`.vault/Spark/ideas/yue2-song-lab.md`) does not travel with the repo.
- Claims are marked VERIFIED (measured, or read in code) or NOT VERIFIED.
- The operator's page is `docs/yue2.md`; the agent ops are in `docs/mcp.md` "The song lab".

## What exists

**S1 - the engine and the ledger.**
- **Scripts:** `pipeline/yue2/{gen,score,post,analyze}.py` run inside WSL through `lib/yue2/wsl.ts`: `wsl.exe --exec`, an argument array, no shell.
- **Producers:** `yue2-render`, `yue2-score` and `yue2-post`, all on lane `gpu.local`, $0.
- **Storage:**
  - takes go to the sound store, with facts (condition, lineage, the CC BY-NC rights record, the sha);
  - scores go to the derived `audio_song_scores` table;
  - blind A/B pairs and votes are `audio.ab.*` events.
- **MCP:** `gt_songlab`.

**S2 - the Knockout desk** (`/audio?s=songlab`), the contest winner of `song-lab-agent`.
- **The bracket:** the agent seeds a bracket of the lyric-gate passers (`audio.ab.draw`). The owner judges blind matches; `release` decides who advances.
- **The relay:** a one-line direction becomes `audio.lab.say`. `/studio-agent` (Song lab mode) answers with `audio.lab.turn`, carrying up to 3 rule/launch/post proposals. Keeping a proposal runs it on the server.
- **Post-chain:** stages `stems`, `buses`, `debuzz` and `master` (to a reference).

**Measured recipe** (VERIFIED, 2026-11-04, 68 renders of one boom-bap song, RTX 4090):
- the settings: `cot=off`, `cfg 1.5`, no adapter, 8 seeds, lyric gate WER <= 0.10;
- 5 of 8 seeds pass the gate;
- the failure mode is a looping chorus, not diction;
- the hip-hop slider adds nothing, and the old-school adapter breaks without a plan;
- a seeded render is deterministic: the same seed and settings give byte-identical scores.

## Set up a second machine (Windows + WSL2 + an NVIDIA card with at least 12 GB)

1. **Get the commits.** The work is on this machine's local main and is **not pushed**: the owner pushes, then pulls on the second machine. `npm ci` there.
2. **Cap WSL's memory** before anything else. VERIFIED on the first machine: with no `.wslconfig`, `vmmemWSL` held 25.3 GB, of which WSL used 6 GB and the other 19 GB was page cache (model weights and audio) it never returned. Claude Code's low-memory guard then killed the long runs twice. Write `%USERPROFILE%\.wslconfig`, size `memory` to that machine (about 40% of RAM), then run `wsl --shutdown`:
   ```ini
   [wsl2]
   memory=24GB
   [experimental]
   autoMemoryReclaim=dropCache
   ```
   Docker Desktop restarts its own `docker-desktop` distro after a shutdown; stop it with `docker desktop stop` when it is not needed.
3. **The two venvs:** run `pipeline/yue2/install-gen.sh` (YuE2 at `~/yue2-lab/.venv`, torch 2.10 pinned) and `pipeline/yue2/install-eval.sh` (scoring and post at `~/yue2-lab/.venv-eval`). The doctor names the exact command for whatever is missing. Env vars: `YUE2_WSL_DISTRO`, `YUE2_HOME`, `YUE2_PY_GEN`, `YUE2_PY_EVAL` (`docs/yue2.md`).
4. **The first YuE2 load downloads about 7.3 GB of weights** (about 10 min). The scorer downloads Qwen3-ASR, Whisper large-v3, the SongEval checkpoint + MuQ, Audiobox Aesthetics and a Mel-RoFormer once.
5. **Never point a session at the operator's store.** Set `GRAVITONE_STORE_PATH`, `SOUND_STORE_DIR` and `SOUND_LEDGER_PATH` to temp paths for every test or smoke. The real backfill of the yue2-lab takes is `npx tsx pipeline/yue2/import.mts --from <outputs dir>` (dry by default; `--apply` is the operator's own run).
6. **Run** `npm run worker -- --lanes gpu.local` (the producers' runner). The desk is `/audio?s=songlab`; the agent is `/studio-agent` in Claude Code.

## Step 0 - the owed verification: one uninterrupted live loop

Every step below passed live at least once on the first machine (VERIFIED), but not in one uninterrupted run: the memory guard killed it twice. The loop:
1. `appendLabSay("less chorus looping")`;
2. `labInbox` returns it;
3. an agent turn with a 2-seed launch proposal (seeds 1 and 4, recipe);
4. `keepProposal` enqueues `yue2-render`, and a second keep is a conflict;
5. the worker renders 2 takes and scores them (VERIFIED: WER 0.0192 and 0);
6. `drawFor("main")` draws a size-8 bracket with walkovers;
7. the worker cuts the two ab-window clips (failed once on an onset bug, fixed in `c62e993f`; after the fix, cut directly on the real take: onset 10.05 s, window [10.05, 35.05]);
8. a vote;
9. `bookAfterVote`;
10. the champion.

Pass = all ten in one run, with both `yue2-ab/<pair>-a|b.flac` files on disk before the vote. Drive it either:
- from the desk with the agent; or
- with a script calling the lib functions under `node --import ./pipeline/lib-hooks.mts`. The first machine's script was a scratch file; rebuild it from the steps above.

After a hard kill of the worker, no Linux `pipeline/yue2` process may remain. VERIFIED: gone in 0.6-1.8 s since the stdin-EOF launcher (`7e2b3cd3`).

## The experiment: can the song lab make game audio?

**The question:** is YuE2 useful beyond songs, for game music (menu themes, level beds, boss tracks, adaptive layers)?

**What it cannot do (VERIFIED on the model card, 2026-11-05):**
- **No voice cloning.** No reference audio, voice prompt or in-context learning; `cover` keeps only the melody.
- **No sound effects.**
- **No loop or stem output.**

**The licence:** CC BY-NC 4.0, so prototypes and jams only. A sold game needs the authors' commercial licence; the reported permission for individual creators is NOT VERIFIED.

**Scoring:** every take is scored by the existing scorer, and every listening verdict goes through the Knockout desk (pairs of kind `post-variant`, so the comparison stays blind).

### E1 - instrumental renders
- **Hypothesis:** empty lyric sections render instrumental (an agent reported this in S1; NOT VERIFIED on the model card), and a style prompt that names no vocal plus an instrumental adapter (`Mothersuperior/YuE2-instrumental-cot-full-loras`) removes vocals reliably.
- **Run:** 8 seeds each:
  - (a) all sections empty;
  - (b) style "instrumental, no vocals";
  - (c) the instrumental adapter at 0.3 / 0.5. The card warns that 1.0 drops the vocal line of a sung song.

  Use a game brief, e.g. "dark synthwave level bed, 100 BPM, pulsing bass, no vocals".
- **Measure:**
  - vocal presence = ASR transcript word count on the full mix + the vocal-stem energy after separation, in dB under the mix;
  - SongEval mean;
  - duration.
- **Pass:** at least 6/8 seeds with zero transcribed words and vocal-stem energy at least 25 dB under the mix.

### E2 - length control for a cue
- **Hypothesis:** with no duration parameter, length tracks the number of (empty) sections and their order.
- **Run:** 3 section layouts × 4 seeds.
- **Measure:** duration per layout, and its spread across seeds.
- **Pass:** a layout whose 4 seeds land within ±10 s of a 60 s and a 90 s target.

### E3 - a loop cut from a render
- **Hypothesis:** a beat-grid cut of N bars (beat tracking in the eval venv; the tempo is in the style prompt) with a short equal-power crossfade makes a seamless loop.
- **Run:** cut 8- and 16-bar loops from the E1 passers.
- **Measure:**
  - the sidecar `triage` checks `loop-seam` and `tempo-instability` (`pipeline/audio`, already in gravitone; run them on the looped file);
  - a blind A/B in the desk: loop played 3x vs the raw section ("would release").
- **Pass:** no `loop-seam` finding on at least half the cuts, and the ear prefers or ties the loop.
- **Deliverable if it passes:** a `loop` op in `post.py` (bars, crossfade ms) and a post stage, through the normal contract.

### E4 - adaptive layers from stems
- **Hypothesis:** the separated stems (vocals / drums / bass / other) can serve as intensity tiers for a game's adaptive music: L1 = other, L2 = +bass, L3 = +drums.
- **Measure:**
  - each tier's loudness at a common reference (game middleware commonly targets about -16 to -18 LUFS for music; NOT VERIFIED here, so pick the project's target and record it);
  - the stem re-sum residual (the post-chain reports it: VERIFIED -22.8 dB separation residual on hiphop_s3);
  - bleed between stems, judged by ear;
  - a blind A/B: tier L2 vs L3 "would ship in a game".
- **Pass:** tiers within ±1 LU of the target, and no tier the ear marks with `section-bleed` or `spectral-imbalance`.
- **Registry:** read `game-production/asset-production/motion-and-audio/adaptive-music-authoring` (golden path + `music-acceptance-beyond-decode-checks`) BEFORE E4. It is the governing standard.

### E5 (optional, consent-bound) - a specific voice
- **Hypothesis:** voice conversion (Applio/RVC, maintained; Seed-VC is archived) on the separated vocal moves a take to a target voice without hurting intelligibility.
- **Needs:** 10+ minutes of a consenting voice (the owner's own). Never a real person without consent, never a celebrity.
- **Measure:** WER before and after (the research warned fast rap consonants blur), SongEval naturalness, and a blind A/B.
- **Pass:** WER not worse by more than 0.02, and the ear does not prefer the original.

### Budget and order
- **Order:** step 0 first, then E1 -> E2 -> E3 -> E4. E5 only if wanted.
- **GPU time** on a 4090: about 35 s per render plus about 30 s per score. E1 is about 24 renders, so about 30 min with scoring; E2 is 12 renders; E3/E4 are CPU-heavy post (separation about 6 s per clip).
- **Store results** as takes with facts (condition + a `use` note such as "game: level bed"), so the desk and the agent see them.
- **Record the outcome here:** what passed, with numbers.

## Known gaps carried forward
- `runs-live.probe` fails in full parallel runs on main (inherited; passes alone).
- A failed or stopped render does not score the takes it already filed (deferred).
- **The S2 port's fidelity:** 10 style-contract deviations from the contest winner, stated (draw tabs on the shared TabRail; colour-mix serialisation of token colours).
- **The `/audio` bundle budget** is raised in the landing commit with its reason (Knockout + its components).
- **The memory spike** that tripped the guard is the WSL page cache (step 2), not a song-lab leak. One scorer per take is VERIFIED; the earlier "two scorers" was a process-listing artifact (`7e2b3cd3`).
