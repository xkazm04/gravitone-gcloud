---
source: fireship--deepseek-code-report
channel: Fireship
title: "This free Chinese AI just crushed OpenAI's $200 o1 model..."
url: https://www.youtube.com/watch?v=-2k1rcRzsLA
published: 2025-01-21
duration_s: 280
essay_body_s: 245
views_at_capture: 3117808
captured: 2026-08-11
engine: briefing
read: in full
corpus: ../corpus/fireship-codereport--2k1rcRzsLA.stamped.txt
transcript_kind: ASR auto-captions (unpunctuated — no sentence-level data)
---

# Fireship — *The Code Report: DeepSeek R1*

The reference teardown for **Engine E — Briefing**: the viewer has no position on something that
happened yesterday, and the video's job is to hand them a defensible one fast.

## The beat chain

```
[0:00]  NEWS + EXPOSURE: "yesterday China released a state-of-the-art free and open source Chain of
        Thought reasoning model with performance that rivals OpenAI o1 — which I'm stupidly paying
        $200 a month for right now"                    ← the stake declared in 5 seconds
   THEREFORE
[0:10]  THE FRAME: "there's two types of people in the tech world right now" — pessimists (AI is
        overhyped, plateaued at GPT-3.5) vs optimists (superintelligence, the singularity)
[0:25]  THE APHORISM: "pessimists sound smart while optimists make money"   ← the thesis, portable
   BUT
[0:30]  "sometimes it's hard to be an AI optimist because you need to trust hype Jedi like Sam Altman
        and closed AI companies like OpenAI"
   THEREFORE
[0:38]  "luckily, on the same day TikTok's ban was removed, China gave the world a gift"
[0:45]  THE PROMISE: "in today's video you'll learn exactly how to use it like a senior prompt engineer"
[0:48]  SIGNATURE: "it is January 21st 2025 and you're watching the Code Report"   ← dated, out loud

── DIGRESSION · ~35s, 12% of runtime ─────────────────────────
[1:00]  Altman at Trump's inauguration · a meme template · Zuckerberg · Altman conceding the hype is
        out of control and there is no internal AGI
[1:20]  the joke that doubles as evidence: a researcher got ChatGPT to DoS websites by feeding it
        parallel URLs — "which is something that no truly intelligent being would do"

── THE ARGUMENT ──────────────────────────────────────────────
[1:40]  o1 was a step forward, but open source caught up
   THEREFORE  benchmarks: R1 is on par with o1, exceeds it in maths and software engineering
   BUT ◀── THE SKEPTICAL CHECK
[1:58]  "let me remind you once again that you should never trust benchmarks" — Epoch AI, which
        provides a popular maths benchmark, disclosed it is funded by OpenAI, "which feels a bit like
        a conflict of interest"
[2:10]  "I don't care about benchmarks anyway and just go off vibes"
   THEREFORE
[2:12]  HANDS-ON: web UI, Hugging Face, local via Ollama. 7B = 4.7GB; full = 671B params, 400GB+;
        32B is roughly o1-mini
   THEREFORE
[2:40]  THE MECHANISM: "one thing that makes DeepSeek different is that it doesn't use any supervised
        fine tuning — instead it uses direct reinforcement learning"
[2:48]  QUESTION 1: "but what does that even mean?"
   THEREFORE  normally SFT shows worked examples; R1 "pulls itself up by its own bootstraps" — tries
        many answers, groups them, scores them, reinforces the high scorers
[3:20]  SHOW: the actual chain of thought, prompted locally
[3:25]  PRACTICAL: "keep the prompt as concise and direct as possible… the idea is that it does the
        thinking on its own"
[3:48]  QUESTION 2: "when to use a Chain of Thought model instead of a regular LLM?"
   THEREFORE  complex problem solving, advanced maths, puzzles, coding that needs planning
[4:00]  ══ sponsor, 35s ══
[4:35]  SIGNATURE CLOSE: "this has been the Code Report"
```

## What transfers

1. **Declared exposure in the first five seconds.** The presenter is $200/month deep before offering
   any judgment. The cheapest credibility move available to commentary.
2. **The frame before the evidence.** "Two types of people" gives a viewer with no position an axis to
   stand on, and the aphorism — *pessimists sound smart while optimists make money* — is the thesis in
   portable form, doing a reframe's job at the front instead of the end.
3. **The skeptical check** (1:58): a move against the video's own enthusiasm, with a concrete
   instance. Without one, a Briefing is a press release.
4. **Two questions asked aloud**, at 2:48 and 3:48 — mid-form act structure, minimal and audible.
5. **Dated by construction.** "It is January 21st 2025" is an honesty device as much as a signature:
   it tells a future viewer exactly how stale this is.
6. **The digression is bounded and placed** — 12% of runtime, after the promise, before the mechanism.

## Measured

234 wpm (1085 words / 278s) — the fastest full-length rate measured · second person 24.0/1k · "I"
8.3/1k (highest measured) · contractions 26.7/1k · connectives 16.6/1k · numbers 10.1/1k · hedges
4.6/1k. ASR captions — **no sentence-level or causal-opener data available.**

## What does not transfer

- The meme/persona digression is channel equity, not craft. Affordable *here* at 12%; not a general
  allowance — see PATTERNS §3, where Adjudication cannot afford it at all.
- 234 wpm is talking-head-over-code pacing. An animated template will not sustain it.
