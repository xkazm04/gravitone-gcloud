"""The triage half of the audio sidecar: one detector per check, over one decoded file, judged
against the brief it was made from.

    python pipeline/audio/sidecar.py triage --in <file> --context <context.json> --json
      -> {"ok":true,"triage":{"version":1,"findings":[...],"flagged":n}}

The checks, their units and what flags are DEFINED in packages/domain/src/audio.triage.ts (its
header); this file implements those definitions and nothing else. The detectors themselves are
in triage_detect.py (numpy/scipy); this module holds the contract half and imports only the
standard library at its top, so the tables below can be read on a Python with nothing installed.

THE THRESHOLDS ARE HELD TWICE, ON PURPOSE (Director, 2026-10-24). The CLI is exactly `--in`,
`--context`, `--json`, and the context is the brief - a strict schema (`triageContextSchema`)
with no room for a `thresholds` key, and a second argument would be a second way for one take to
be judged by two tables. So THRESHOLDS below is @gt/domain's `TRIAGE_THRESHOLDS` again, in
Python, and tests/next-server/audio-triage.test.ts imports the TS table, dumps this one with
`python -c`, and fails when they differ (UNITS, CHECK_DEFECT and the check order with them). A
threshold moved by the eval harness is moved in BOTH files or that test is red.

THE FLAG RULE, one for every check: a value that REACHES its threshold flags (`>=`) - the
threshold is where the defect begins, so a 1.5 s gap against a 1.5 s bar is dead air. The one
exception is loudness-range, a band: outside [lufsMin, lufsMax] flags, a bound itself passes.

THE CHECKS (method in one line each; units and defaults are the TS table's):
  clipping          longest run of consecutive samples at |x| >= 0.999 in ONE channel (a run in
                    L beside a run in R is two runs, not one); atS = its first sample. 3 samples.
  true-peak-over    loudness.true_peak_db (4x oversampled); skips a file with no signal. 0 dBTP.
  loudness-range    loudness.integrated_lufs (BS.1770); null (silent, < 400 ms) flags. Music
                    -30..-6, sfx -40..-6, voice -30..-10 LUFS; `threshold` is the bound crossed,
                    or the nearer bound on a pass.
  dead-air          50 ms windows silent below -50 dBFS RMS (loudness.py's windows), the longest
                    run of silent windows between the first and the last loud one; atS = its
                    start. Music 2 s, sfx/voice 1.5 s.
  duration          |decoded length - asked| / asked; skips without `durationS`. Music/sfx 0.1,
                    voice 0.35.
  broken-ending     (triage_edges.py, whose header has the measurements behind it) 10 ms frames;
                    the audible end is the last frame above the take's own floor (its
                    95th-percentile frame minus 45 dB, never under -100 dBFS); value = that final
                    frame's level minus the median active level of the 2 s before it, dB. At or
                    above -12 dB the take stops at body level - unless its envelope falls 30 dB/s
                    or more over the last 300 ms (a final syllable, a decaying hit), which passes
                    with a note. The silent tail after the audible end flags at `tailS` (music 3 s,
                    sfx/voice 2 s), with a note. Skips a loop (its end is its seam), a silent file,
                    and an audible part with under 0.5 s of active frames.
  tempo-instability music only. Onset strength = half-wave-rectified dB-spectral flux (per
                    channel, the first two averaged, decimated to ~11 kHz, 512-sample frames, 64-sample hop, magnitudes floored
                    70 dB under full scale); tempo of a span =
                    the 60..200 bpm candidate whose lag and its multiples (up to 4) score highest
                    on the span's unbiased autocorrelation. The whole file fixes the octave (a
                    mild prior around the brief's `tempoBpm`, else 120); each third is then
                    searched within +-10 % of it. value = |first third - last third|. Skips a file
                    whose thirds hold fewer than 4 beats or 3 s, and a span with no steady pulse
                    (99th-percentile flux under 100 dB - no onsets - or best normalised
                    autocorrelation under 0.1): a guessed tempo is not a drift.
                    3 bpm.
  section-boundary  novelty = for every 0.1 s frame (band power averaged over the first two
                    channels, never their sum), the RMS over 24 log bands (60 Hz..16 kHz) of
                    the difference between the mean band level (dB) in the 3 s before and the
                    3 s after; peaks = local maxima over +-1.5 s at least 1 dB and 30 % of the
                    largest, not within 1 s of either end. value = the largest distance from a
                    planned boundary (`sections[i].startMs`, i >= 1) to its nearest peak; atS =
                    that boundary. No peak at all flags with a null value. Skips without two
                    sections, a file with no signal, and one under ~2.2 s. 2 s.
  loop-seam         (triage_edges.py) only a take briefed `loop: true`; the step the end makes
                    into the start, judged against the take itself. 100 ms Hann windows at a 50 ms
                    hop over the loop played into itself; features = level dB and four groups of
                    the 24 log bands (each floored 60 dB under the loudest). A loop with a RHYTHM
                    (lags L/k and 2L/k of its 10 ms envelope autocorrelating >= 0.8): the largest
                    such k whose k power-averaged spans lie on one line within 1 dB, and value =
                    that line's slope across the whole length - the drift its repeats make, which
                    is the step its end makes into its start. A TEXTURE (no such k): the step from
                    its last 0.5 s into its first minus the median of that step at every 0.25 s
                    inside it. And the waveform jump |x[0] - x[-1]| over the take's 99.9th-
                    percentile sample step, dB. value = the largest; atS = the length. Skips a
                    loop under 2 s. 3 dB.
  mono-fold         LUFS(L, R) - LUFS(M, M) where M = (L+R)/2: the fold-down as it is heard, on both
                    speakers. (Measuring M as ONE channel would read 3.01 dB lower for a file whose
                    L and R are identical - every mono-compatible stereo take would flag.) A fold
                    that cancels to no loudness flags with a null value. Skips a mono file; of more
                    than two channels the first two. 3 dB (fully decorrelated L/R loses 3.01 dB).

Every finding is {check, defect?, verdict, value, threshold, unit, atS?, note?}; `defect` is the
lib/sound/types.ts DEFECTS code a structural check evidences; `flagged` counts the flags. A check
whose context was never committed SKIPS with a note and value null - it never guesses.
"""

import math

TRIAGE_VERSION = 1

TECHNICAL_CHECKS = ("clipping", "true-peak-over", "loudness-range", "dead-air", "duration")
STRUCTURAL_CHECKS = ("broken-ending", "tempo-instability", "section-boundary", "loop-seam", "mono-fold")
TRIAGE_CHECKS = TECHNICAL_CHECKS + STRUCTURAL_CHECKS

CHECK_DEFECT = {
    "broken-ending": "broken-ending",
    "tempo-instability": "tempo-instability",
    "section-boundary": "off-brief",
    "loop-seam": "loop-seam",
    "mono-fold": "phase-width",
}

TRIAGE_KINDS = ("music", "sfx", "voice")

THRESHOLDS = {
    "music": {"clipping": 3, "truePeakDb": 0, "lufsMin": -30, "lufsMax": -6, "deadAirS": 2, "durationRatio": 0.1, "endingDb": -12, "tailS": 3, "tempoDriftBpm": 3, "sectionS": 2, "seamDb": 3, "monoLossDb": 4},
    "sfx": {"clipping": 3, "truePeakDb": 0, "lufsMin": -40, "lufsMax": -6, "deadAirS": 1.5, "durationRatio": 0.1, "endingDb": -12, "tailS": 2, "tempoDriftBpm": 3, "sectionS": 2, "seamDb": 3, "monoLossDb": 4},
    "voice": {"clipping": 3, "truePeakDb": 0, "lufsMin": -30, "lufsMax": -10, "deadAirS": 1.5, "durationRatio": 0.35, "endingDb": -12, "tailS": 2, "tempoDriftBpm": 3, "sectionS": 2, "seamDb": 3, "monoLossDb": 4},
}

UNITS = {
    "clipping": "samples",
    "true-peak-over": "dBTP",
    "loudness-range": "LUFS",
    "dead-air": "s",
    "duration": "ratio",
    "broken-ending": "dB",
    "tempo-instability": "bpm",
    "section-boundary": "s",
    "loop-seam": "dB",
    "mono-fold": "dB",
}

# Decimal places a value is reported to, by unit: finer than the Board prints, coarser than the
# float noise of the method.
PLACES = {"samples": 0, "dBTP": 2, "LUFS": 2, "s": 3, "ratio": 4, "dB": 2, "bpm": 2}


class ContextRefused(ValueError):
    """A context this sidecar will not judge against; the message is the refusal with its path."""


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def validate_context(doc):
    """The brief as a plain dict, or ContextRefused naming the first defect's path - the same
    rules as `triageContextSchema` (strict objects; positive durationS/tempoBpm; boolean loop;
    sections of {name, startMs >= 0, endMs > 0}), in the door's spelling."""
    if not isinstance(doc, dict):
        raise ContextRefused("(root): expected an object")
    extra = sorted(set(doc) - {"kind", "durationS", "tempoBpm", "loop", "sections"})
    if extra:
        raise ContextRefused(f"(root): unrecognized key {extra[0]!r}")
    if doc.get("kind") not in TRIAGE_KINDS:
        raise ContextRefused(f"kind: expected one of {', '.join(TRIAGE_KINDS)}, got {doc.get('kind')!r}")
    for key in ("durationS", "tempoBpm"):
        if key in doc and not (_num(doc[key]) and doc[key] > 0):
            raise ContextRefused(f"{key}: expected a positive number, got {doc[key]!r}")
    if "loop" in doc and not isinstance(doc["loop"], bool):
        raise ContextRefused(f"loop: expected a boolean, got {doc['loop']!r}")
    if "sections" in doc:
        secs = doc["sections"]
        if not isinstance(secs, list):
            raise ContextRefused("sections: expected an array")
        for i, s in enumerate(secs):
            if not isinstance(s, dict):
                raise ContextRefused(f"sections.{i}: expected an object")
            extra = sorted(set(s) - {"name", "startMs", "endMs"})
            if extra:
                raise ContextRefused(f"sections.{i}: unrecognized key {extra[0]!r}")
            if not isinstance(s.get("name"), str):
                raise ContextRefused(f"sections.{i}.name: expected a string")
            if not (_num(s.get("startMs")) and s["startMs"] >= 0):
                raise ContextRefused(f"sections.{i}.startMs: expected a non-negative number, got {s.get('startMs')!r}")
            if not (_num(s.get("endMs")) and s["endMs"] > 0):
                raise ContextRefused(f"sections.{i}.endMs: expected a positive number, got {s.get('endMs')!r}")
    return doc


def finding(check, verdict, value=None, threshold=None, at_s=None, note=None):
    """One finding in the wire shape; `value` rounded to its unit's places, keys absent when unset."""
    unit = UNITS[check]
    out = {"check": check}
    if check in CHECK_DEFECT:
        out["defect"] = CHECK_DEFECT[check]
    places = PLACES[unit]
    v = None if value is None else (int(round(value)) if places == 0 else round(float(value), places))
    out.update({"verdict": verdict, "value": v, "threshold": threshold, "unit": unit})
    if at_s is not None:
        out["atS"] = round(max(0.0, float(at_s)), 3)
    if note is not None:
        out["note"] = note
    return out


def skip(check, note, threshold=None):
    return finding(check, "skip", None, threshold, note=note)


def reaches(value, threshold):
    """The flag rule: a value at or past its threshold flags."""
    return "flag" if value >= threshold else "pass"


def run(x, rate, ctx):
    """The `triage` object for samples shaped (frames, channels) at `rate`, judged against `ctx`
    (an already validated context)."""
    import triage_detect as d
    import triage_edges as e

    th = THRESHOLDS[ctx["kind"]]
    take = d.Take(x, rate)
    findings = [
        d.clipping(take, th),
        d.true_peak_over(take, th),
        d.loudness_range(take, th),
        d.dead_air(take, th),
        d.duration(take, th, ctx),
        e.broken_ending(take, th, ctx),
        d.tempo_instability(take, th, ctx),
        d.section_boundary(take, th, ctx),
        e.loop_seam(take, th, ctx),
        d.mono_fold(take, th),
    ]
    assert [f["check"] for f in findings] == list(TRIAGE_CHECKS)
    return {"version": TRIAGE_VERSION, "findings": findings, "flagged": sum(1 for f in findings if f["verdict"] == "flag")}
