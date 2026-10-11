"""Reader for pipeline/vocab/cinematography.json -- the one cinematography vocabulary.

Every Python module that needs an enum, an ordinal scale, a weight or a field
set for a machine judgement builds it HERE, from the file, instead of keeping
its own literal. The TypeScript twin is lib/vocab/cinematography.ts; the gate
that holds both to the file is pipeline/check-vocab.mjs.

    import vocab
    vocab.enum("shot_size")            # ["extreme-wide", ...]
    vocab.schema_props("craft_frame")  # JSON-schema properties, in subset order
    vocab.version()                    # stamped onto every annotation row
"""

import json
from pathlib import Path

PATH = Path(__file__).parent / "cinematography.json"

_cache = None


def load():
    global _cache
    if _cache is None:
        _cache = json.loads(PATH.read_text(encoding="utf-8"))
    return _cache


def version():
    return load()["version"]


def fields(subset):
    """Field names of a named subset, in the order the pass asks for them."""
    return list(load()["subsets"][subset])


def spec(name):
    return load()["fields"][name]


def enum(name):
    s = spec(name)
    if s["kind"] != "enum":
        raise KeyError(f"{name} is not an enum field")
    return list(s["enum"])


def group_enums(group):
    """{field: enum} for every enum field of a group."""
    return {n: list(f["enum"]) for n, f in load()["fields"].items()
            if f["group"] == group and f["kind"] == "enum"}


def ordinal(subset):
    """{field: ordered values} for the ordinal fields of a subset. Enum order IS the scale."""
    return {n: enum(n) for n in fields(subset) if spec(n).get("ordinal")}


def weights(subset):
    return {n: spec(n)["weight"] for n in fields(subset)}


def schema_props(subset, pass_name=None):
    """JSON-schema `properties` for a subset. `pass_name` picks a per-pass
    description where the file carries one (the same field is worded slightly
    differently for the per-source pass and the per-image pass)."""
    out = {}
    for n in fields(subset):
        s = spec(n)
        desc = (s.get("passDescriptions") or {}).get(pass_name or subset, s["description"])
        if s["kind"] == "enum":
            out[n] = {"type": "string", "enum": list(s["enum"]), "description": desc}
        elif s["kind"] == "list":
            out[n] = {"type": "array", "items": {"type": "string"},
                      "description": f"{desc} (at most {s.get('maxItems', 6)} short entries)"}
        else:
            out[n] = {"type": "string", "description": desc}
    return out
