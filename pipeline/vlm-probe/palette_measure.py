"""Measure what a style readback only names: the frames it saw, and their palette.

style.py asks two readers for `palette_strategy`, a closed enum, over the same
eight frames. Over the six sources both readers profiled (2026-09-14), they
gave six different answers - monochrome against duotone on a clip whose
saturated pixels sit 99.6% inside one 60-degree hue window. The enum was never
wrong because the readers are weak; it was wrong because a value that is
sitting in the pixels was being asked of a perceiver. So this module measures
it, over exactly the frames the readers were sent, and the row carries both.

It also declares the sampling. The readback picks `kept` of `available`
published frames, and a row that records only the eight names cannot say which
instants it skipped or whether the stride was even (registry technique
motion-sampled-under-a-frame-budget).

Stdlib only at import time, so foundry/selftest.py can exercise it with no
third-party package installed. Pillow is imported inside measure_frames.
"""

import colorsys

NEAR_BLACK_V = 0.12   # value below this is shadow, not colour
SATURATED_S = 0.20    # saturation at or above this carries a hue


def pick_evenly(available, kept):
    """The pick style.py has always made, plus what it never said about it.

    Returns (indices, sampling). The indices are unchanged from the original
    `paths[int(i * step)]` so rows written before and after stay comparable.
    """
    n = min(kept, available)
    if n <= 0:
        return [], {"kept": 0, "available": available, "stride": None, "gaps": []}
    step = available / n
    idx = [int(i * step) for i in range(n)]
    gaps = sorted({b - a for a, b in zip(idx, idx[1:])})
    return idx, {"kept": n, "available": available,
                 "stride": gaps[0] if len(gaps) == 1 else None, "gaps": gaps}


def palette_stats(pixels):
    """Palette measures over an iterable of (r, g, b) 0-255 tuples.

    A set with no hue-bearing pixel reports hue fields as None - unmeasured,
    never 0.0, which would read as "spread evenly across every hue".
    """
    total = black = 0
    sat_sum = sat_n = 0
    hues = [0] * 360
    for r, g, b in pixels:
        total += 1
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if v < NEAR_BLACK_V:
            black += 1
            continue
        sat_sum += s
        sat_n += 1
        if s >= SATURATED_S:
            hues[int(h * 360) % 360] += 1  # 180 degrees is bin 180, not 179
    nsat = sum(hues)
    if nsat:
        window = max(sum(hues[(i + k) % 360] for k in range(60)) for i in range(360))
        families = sorted(((sum(hues[i:i + 30]), i) for i in range(0, 360, 30)), reverse=True)
        concentration = round(window / nsat, 3)
        top = [[deg, round(count / nsat, 2)] for count, deg in families[:2] if count]
    else:
        concentration, top = None, []
    return {
        "pixels": total,
        "near_black_share": round(black / total, 3) if total else None,
        "mean_saturation": round(sat_sum / sat_n, 3) if sat_n else None,
        "saturated_share": round(nsat / sat_n, 3) if sat_n else None,
        "hue_concentration_60deg": concentration,
        "top_hue_families_deg": top,
    }


def measure_frames(paths, size=(160, 90)):
    """palette_stats over every pixel of the given frames, downscaled."""
    from PIL import Image  # noqa: PLC0415 - kept out of import time on purpose

    def pixels():
        for p in paths:
            with Image.open(p) as im:
                yield from im.convert("RGB").resize(size).getdata()

    stats = palette_stats(pixels())
    stats["frames"] = len(paths)
    return stats
