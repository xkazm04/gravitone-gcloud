"""`render-score` on the warm worker (sidecar.py serve, lib/audio/renderWorker.ts) - spark audio-agent-studio S2.

One request per stdin line, one answer per stdout line, until stdin ends:
    {"verb":"render-score","id":..,"spec":{..},"outDir":..,"cacheDir"?:..,"verifyDeterminism"?:bool,"allowFallback"?:bool}
    -> {"id":.., ...exactly what the cold `sidecar.py render-score` prints}
A ScoreRefused (a bound, the id rule, a refused stand-in) answers kind "refused"; any other failure
answers the tool's own sentence with kind "failed" and the loop goes on. Every other verb (audition,
sketch) goes to audition.serve unchanged. The cold verb answers through the same `answer`, so the
two paths cannot drift.
"""

import json


def answer(spec_doc, out_dir, cache_dir=None, verify_determinism=False, allow_fallback=False):
    """The render-score answer document: the render result, or {ok:false, error, kind:"refused"}."""
    import render_score

    try:
        return render_score.render_score(
            spec_doc, out_dir, cache_dir=cache_dir, verify_determinism=bool(verify_determinism), allow_fallback=bool(allow_fallback),
        )
    except render_score.ScoreRefused as e:
        return {"ok": False, "error": f"score spec: {e}", "kind": "refused"}


def handle(req):
    rid = req.get("id")
    try:
        for need in ("spec", "outDir"):
            if need not in req:
                return {"id": rid, "ok": False, "error": f"render-score request: missing {need}", "kind": "refused"}
        doc = answer(req["spec"], req["outDir"], req.get("cacheDir"), req.get("verifyDeterminism"), req.get("allowFallback"))
    except ImportError as e:
        doc = {"ok": False, "error": str(e), "kind": "missing-module"}
    except Exception as e:  # the tool's own sentence, as the cold verb's top-level handler says it
        doc = {"ok": False, "error": str(e) or type(e).__name__, "kind": "failed"}
    return {"id": rid, **doc}


def serve(stdin, stdout):
    """The warm loop: render-score here, everything else through audition.serve."""
    # Paid before the first request, so a pre-warmed worker answers its first render at render speed.
    import numpy  # noqa: F401
    import soundfile  # noqa: F401
    import render_score  # noqa: F401  (scipy, the score compiler, the instrument catalog)
    from audition import serve as serve_audition

    for line in stdin:
        text = line.strip()
        if not text:
            continue
        try:
            req = json.loads(text)
        except ValueError:
            req = None
        if isinstance(req, dict) and req.get("verb") == "render-score":
            stdout.write(json.dumps(handle(req)) + "\n")
            stdout.flush()
        else:
            serve_audition([text], stdout)
