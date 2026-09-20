# Scenario envelope — what the local still stack composes, and how we know

**Measured 2026-09-20 on the 4090 box.** `scenario_probe.py`, Flux 2 dev,
1280x544, 20 steps, seed 3, one style block held constant across all nine.

## Why this file exists

A render A/B is only interpretable if the scenario under it renders *at all*.
An arm pair over a brief the stack cannot compose compares noise with noise, and
its verdict — win, tie or refusal — cannot be told apart from **the technique
being wrong**. That failure is not hypothetical: on 2026-09-20 an external run
rendered four incoherent clips of an invented night brief through bare `wan` t2v,
computed a consistency ratio over them, and could not say which half had failed.

So: **prove the scenario before you design the pair.** This is the same
precondition `rig_check.py` already enforces for rigs before anything is
animated. The scenarios are this repo's own nine role x size trailer recipes —
real use cases, already IP-neutral — and each carries a *countable* expectation
so two readers grade the same claim the same way.

## The envelope

| scenario | expectation (countable) | verdict |
| --- | --- | --- |
| `setup-EWS` | horizon; one dark mass at ~1/3 frame; **exactly one** distant light; layered depth | **pass** |
| `setup-MS` | **exactly one** figure; from behind; destination visible beyond | **pass** |
| `rung-WS` | **three or more** figures advancing; rim-lit from behind; faces unreadable; ground haze | **pass** (8 figures) |
| `rung-MCU` | **exactly one** face; centred, symmetrical; one side near-black; surround unlit | **pass** |
| `peak-EWS` | one vast form on the horizon; a **vertical** beam; small figures for scale | **pass** |
| `peak-MS` | **exactly three** figures; abreast; low angle; backlit; **legs cropped by the lower edge** | **partial** — three, abreast, low, backlit, but the *heads* are cropped by the top edge and the feet are fully in frame. The crop is inverted. |
| `peak-ECU` | extreme close; debris/sparks mid-flight; dark ground; sparks the only light | **pass** |
| `reset-EWS` | one small structure; **exactly one** lit window; otherwise dark; lower third clear | **pass** |
| `tail-EWS` | wide landscape; upper third **empty** of focal detail; atmosphere thinning upward | **pass** |

**8 of 9 clean, 1 partial.** Render cost 36–92 s per frame, 9 frames, two engine
recycles on headroom.

## What this licenses, and what it does not

- Any of the eight passing scenarios is a legitimate substrate for a still A/B on
  this stack: a failure there can be attributed to the treatment.
- `peak-MS` is **not**, for anything about framing or crop — the stack does not
  place that crop reliably, so a crop-sensitive arm over it would measure the
  stack. It remains usable for figure count, light direction and haze.
- **It licenses nothing about motion.** Composition and time are separate
  questions. Whether the stack *holds* one of these scenes over time and executes
  a commanded change is a motion pair, run only over scenarios that passed here,
  and on the route this repo actually intends — ref-conditioned / frame-chained
  per `docs/video-generation-plan.md`, graded by the calibrated identity ruler in
  `pipeline/vlm-probe/`, not by a hand-rolled proxy. `CONSISTENCY-FINDINGS.md`
  already records why: *"The ruler had to be built first, and it nearly lied."*

## Re-running

```sh
py pipeline/foundry/scenario_probe.py foundry-out/training/<cycle-id> [--seeds 3,4]
```

Resumable (a PNG on disk is a finished render). Re-measure when the checkpoint,
resolution or step count changes — the envelope is a property of those, not of
the recipes.
