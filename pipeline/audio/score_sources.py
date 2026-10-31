"""Which source a catalog instrument plays from on this machine, and what is missing when it would
play a stand-in instead (spark audio-agent-studio S2: no silent synth stand-ins).

A stand-in is any `scipy-*` source: the synth voice score_instruments falls back to when a sample
pack or the Vital plugin is absent, or the noise drum kit when a kit's samples are. render_score
refuses one unless the request says `allowFallback`, and the refusal names the missing path.
"""

import os

import score_instruments as inst_lib

CONFIG_HINT = "GRAVITONE_ABLETON_SAMPLES_DIR / GRAVITONE_FL_PACKS_DIR or .hackathon/instruments.local.json"


def is_fallback(source):
    return str(source).startswith("scipy-")


def _vital_missing():
    if os.environ.get("GRAVITONE_VST3_DISABLE") == "1":
        return "the Vital plugin (GRAVITONE_VST3_DISABLE=1)"
    vst_dir = inst_lib.runtime_paths()["vst3Dir"]
    path = os.path.join(vst_dir, "Vital.vst3") if vst_dir else ""
    if not path or not os.path.exists(path):
        return f"the Vital plugin {path or 'Vital.vst3 (no vst3Dir configured)'}"
    return None if inst_lib._get_vital() is not None else f"the Vital plugin {path} (it did not load)"


def probe(inst_id):
    """(the source a render will use, None) when the real source is present, else
    (the stand-in it would fall back to, a sentence naming the missing sample path or plugin).
    Reads only file presence (and loads Vital once, as a render would); renders nothing."""
    entry = inst_lib.CATALOG[inst_id]
    paths = inst_lib.runtime_paths()
    ab, fl = paths["abletonSamplesDir"], paths["flPacksDir"]
    if entry["role"] == "drums":
        if len(inst_lib._find_drum_samples(inst_id)) >= 3:
            return "local-sample-kit", None
        if not ab and not fl:
            return "scipy-drum-kit", f"the {inst_id} samples (no sample folder configured: {CONFIG_HINT})"
        want = [os.path.join(ab, *rel.split("/")) for rel in inst_lib.DRUM_PICKS.get(inst_id, {}).values()] if ab else []
        absent = [p for p in want if not os.path.isfile(p)] or [os.path.join(fl, *rel.split("/")) for rel in inst_lib.FL_DRUM_PICKS.values()]
        return "scipy-drum-kit", f"the {inst_id} samples: {'; '.join(absent[:4])}"
    if entry["engine"] == "vital-vst3":
        missing = _vital_missing()
        return ("scipy-synth", missing) if missing else ("vital-vst3", None)
    if entry["engine"] == "sample-pack":
        if inst_lib._find_multisample(inst_id):
            return "local-multisample", None
        if not ab:
            return "scipy-synth", f"the {inst_id} multisample (no abletonSamplesDir configured: {CONFIG_HINT})"
        sub, files = inst_lib.MULTISAMPLES.get(inst_id, ("", []))
        folder = os.path.join(ab, *sub.split("/")) if sub else ab
        first = os.path.join(folder, files[0][0]) if files else folder
        return "scipy-synth", f"the {inst_id} multisample {first} (none of its {len(files)} files are in {folder})"
    return "scipy-synth", f"a real source for {inst_id} (engine {entry['engine']} has none)"
