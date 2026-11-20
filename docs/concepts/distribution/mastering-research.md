# Mastering research for AI-generated songs (spark master-experiments, 2026-11-16)

Web research by a research subagent; [C] confirmed at the URL, [U] unconfirmed or inferred, [K] standard DSP
knowledge with no URL. Nothing below describes Mixea's algorithm: its internals are not public.

## Why a DIY chain degrades an already-normalised AI mix

The source is a finished mix near streaming level (the owner's Suno WAVs: -14.9..-16.3 LUFS, -2.6..-5.5 dBTP),
so a chain has almost nothing to gain and every stage adds distortion or phase change.

Suspects, in order [U unless noted]:
- **A long lookahead limiter** (the old chain: 50 ms): the gain envelope follows the bass period and
  intermodulates it - "pumping on bass-heavy material" [K]. Release too long pumps, too short distorts
  ([Mastering The Mix](https://masteringthemix.com/blogs/learn/how-to-reduce-distortion-when-mastering)).
  A limiter needs ~4x oversampled detection for inter-sample peaks. Matchering's own Python limiter drew
  pumping reports ([issue 15](https://www.github.com/sergree/matchering/issues/15)) [C]. Pedalboard's `Limiter`
  is JUCE `dsp::Limiter`: two compression stages, auto makeup, hard clip at 0 dBFS, `threshold_db` is not the
  ceiling ([docs](https://spotify.github.io/pedalboard/reference/pedalboard.html)) [C].
- **A multiband compressor**: bands that are compressed independently move the crossover seams, and per-band
  RMS renormalisation makes the tonal balance breathe [K].
- **A tanh exciter without oversampling**: harmonics above Nyquist fold back as inharmonic fizz [K].
- **Mid/side widening**: lowers L/R correlation and mono level, makes the image wander if band-dependent [K].
- **Chunked custom DSP**: zipper noise or clicks at block boundaries (Apollo's README warns of chunk seams [C]).
- **Bit depth**: float to 16 bit without TPDF dither, once, last [K].

Suno output [U, no independent measurement found]: delivered WAV is decoded from a lossy stream (48 kHz or
44.1 kHz sources conflict), possibly a ~16 kHz cutoff, "shimmer" between 5 and 12 kHz. Anything that raises
HF (exciter, widening, bright EQ) amplifies codec residue; anything that compresses re-encodes it modulated.

## What commercial one-click masters do

- **Mixea**: "optimizes bass, compression, stereo enhancement, EQ, limiting and loudness"
  ([Hypebot](https://www.hypebot.com/distrokid-adds-mixea-ai-powered-music-mastering-service)); 3 intensities, 4 EQ
  options, intensity "essentially compression", 24-bit/48 kHz out, no published LUFS target; the reviewer found it
  better than his unmastered mix and flatter than a human master ([review](https://aristake.com/distrokid-mixea-mastering-review/)).
- **Ozone Master Assistant**: three presets at -14 / -12 / -11 LUFS; EQ to a target curve, stabilizer,
  dynamics, maximizer ([iZotope](https://downloads.izotope.com/docs/ozone8/master-assistant/index.html)).
- **LANDR**: a loudness knob, no true-peak setting ([SOS](https://www.soundonsound.com/reviews/landr-mastering-plugin)).
- **Spotify**: -14 LUFS normal, true peak <= -1 dBTP (<= -2 above -14); Loud mode applies a -1 dB limiter,
  5 ms attack, 100 ms decay ([support](https://support.spotify.com/us/artists/article/loudness-normalization/)) [C].
- A -15 LUFS input is either barely touched or pushed to -12..-9 LUFS with heavy compression.

## Five candidates (all local, free)

(a) **Transparent loudness**: one linear gain to -14 LUFS, a limiter only if true peak would pass the ceiling.
For -15 LUFS / -4 dBTP the gain is +1 dB and no limiter engages: bit-identical up to a constant.
(b) **Matchering 2.0.6** (`pip install matchering`, GPLv3, 2022): matches RMS, frequency response, peak,
stereo width to a reference; its Hyrax limiter is pure Python and can pump with a loud reference;
reference choice decides the result.
(c) **DeepAFx-ST** ([adobe-research](https://github.com/adobe-research/DeepAFx-ST)): style transfer of EQ and
compression from a reference; Adobe Research License (read first), Python 3.8, Linux-first [U on Windows].
(d) **Static EQ only**: long-term spectrum vs a target curve, correction clamped to +-1.5 dB, cuts preferred,
nothing above 12 kHz, linear-phase FIR (`scipy.signal.firwin2`), same filter on L and R, no dynamics.
(e) **Restoration**: [Apollo](https://github.com/JusperLee/Apollo) (CC BY-SA, MP3-damage repair, chunk seams),
AudioSR (generative, invents HF - not for a finished master), Demucs re-sum (phase/bleed - null-test the
unprocessed re-sum first), Shimmer (proprietary de-noise/notch).

## Evaluating honestly

Match integrated loudness to within 0.1 LU first (louder always wins). Null test (least-squares scaled).
Blind ABX at matched loudness on two devices. True peak after MP3/AAC/Opus round trips (Spotify: leave 1 dBTP,
2 above -14). 4x-oversampled inter-sample peaks. Aliasing from a swept sine. Limiter gain-reduction trace:
energy at 30-120 Hz in its modulation spectrum is the pumping fingerprint; keep GR near or under 2.5 dB.
L/R correlation over time, mono-sum loss, M/S ratio. Spectral change above 16 kHz and 5-12 kHz. PLR before and
after (a fall over 2 dB is real compression). No length or alignment change.

## Recommendation

For a ~-15 LUFS, -4 dBTP file: (a) is the least likely to degrade and the control for everything else; add (d)
only if a listening test shows a tonal problem; target -14 LUFS, true peak <= -1 dBTP, no louder. Before adopting
anything, bisect the old chain stage by stage - the 50 ms limiter and the non-oversampled tanh are hypotheses.

## Experiments on Stay Here (2026-11-16)

One song, `Stay Here.wav` (-14.94 LUFS, -3.99 dBTP, 283.9 s, 48 kHz 16-bit stereo, bass-heavy: 30-250 Hz holds
most of the energy, under 30 Hz is -35 dB). Code: `pipeline/audio/exp/` (`metrics.py`, `stage_bisect.py`,
`run.py`, `listen.py`). Every candidate is level-matched to the original before it is measured. `wobble` is the
std over time of the 100 ms level difference vs the original (0 = a pure gain change); `null` is the residual
re the original (lower = closer).

**What hurt the old chain (bisect, one stage at a time):** the limiter never engaged (wobble 0.000: a bit-exact
gain change) - the research's top suspect is cleared on this song. The 30 Hz high-pass alone: null -9.8 dB, peak
+1.2 dB, wobble 0.32 - it removed nothing (there is no sub-30 Hz) but rotated the phase of everything up to
250 Hz by 37 deg at 40 Hz, 17 deg at 100 Hz, 11 deg at 150 Hz. The same filter done zero-phase: null -21.7 dB,
peak +0.25 dB. The glue compressor: wobble 1.04. The 3-band compressor (uni-3): wobble 2.09. The exciter: +1.3 dB
above 12 kHz. Mid/side: wobble 0.50.

| technique | LUFS / TP | LRA | wobble | null | 12-22k | band change low..air (dB) |
| --- | --- | --- | --- | --- | --- | --- |
| old uni-1 | -14.0 / -2.2 | 4.0 | 1.14 | -9.7 | +0.6 | -1.0 / +0.3 / +0.4 / +0.3 / +0.5 |
| 1 gain (control) | -14.0 / -3.0 | 6.6 | 0.00 | -127 | 0 | 0 |
| 2 tonal-eq (linear-phase, album-average target, <= 0.9 dB) | -14.0 / -2.9 | 6.6 | 0.16 | -28.0 | 0 | +0.3 / +0.2 / -0.4 / -0.4 / +0.1 |
| 3 matchering (ref 'Room Enough') | -16.1 / -4.5 | 4.6 | 1.41 | -8.9 | -4.8 | -0.2 / +2.5 / -1.8 / -4.7 / -4.0 |
| 4 gentle-dyn (gain riding, <= 1.2 dB, no filter) | -14.0 / -3.3 | 5.9 | 0.26 | -28.2 | -0.1 | -0.1 / 0 / +0.1 / 0 / -0.1 |
| 5 apollo (neural restoration, 19 min on a 4090) | -14.0 / -2.1 | 7.2 | 0.28 | -19.7 | -3.3 | +0.3 / +0.2 / +0.1 / -1.2 / -2.6 |

Reading: (1) cannot degrade; (2) and (4) are measurable but small and phase-safe; (3) re-voices the song toward the
reference (darker, quieter by 2 LU) and its own limiter moves the level; (5) removes 3 dB of highs (it reads the
codec band as damage) and costs 19 minutes. The old chain is the only one with both a large null AND a large
wobble. Whether any of (2)-(5) is better than (1) is an ear question; the numbers only say which are safe to
listen to.
