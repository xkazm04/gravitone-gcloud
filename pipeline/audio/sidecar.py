"""The audio sidecar: measure a file, render a voice-fx chain, triage a take, or render a ScoreSpec.

    python pipeline/audio/sidecar.py measure --in <wav|mp3|m4a|...> --json
      -> {"ok":true,"measure":{integratedLufs,truePeakDb,lra,clippedSamples,leadSilenceS,tailSilenceS,durationS}}
    python pipeline/audio/sidecar.py fx --in <wav> --chain <chain.json | inline JSON> --out <wav> --json
      -> {"ok":true,"durationS":n,"gainDb":g,"truePeakDb":tp,"rate":r,"channels":c,"notes":[...]}
    python pipeline/audio/sidecar.py triage --in <file> --context <context.json> --json
      -> {"ok":true,"triage":{"version":1,"findings":[{check,defect?,verdict,value,threshold,unit,atS?,note?}],"flagged":n}}
    python pipeline/audio/sidecar.py render-score --spec <spec.json> --out-dir <dir> [--cache-dir <dir>] [--verify-determinism] --json
      -> {"ok":true,"title":...,"mixPath":...,"mixSha256":...,"measure":{...},"triage":{...},"stems":[...],"determinism":...}
    python pipeline/audio/sidecar.py audition --instrument <id> [--out <wav>] --json
      -> {"ok":true,"id":...,"audition":{...}}
    python pipeline/audio/sidecar.py doctor --json
      -> {"ok":true,"python":"<sys.version>","modules":[...],"missing":[...],"errors":{...},"versions":{...},"ffmpeg":path|null}

The one consumer is lib/audio/sidecar.ts; docs/audio-sidecar.md is the operator's page.
"""

import argparse
import importlib
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

REQUIRED = ("numpy", "scipy", "soundfile", "pyloudnorm", "pedalboard")
CEILING_DBTP = -1.0
TARGET_DBTP = -1.1


class Failure(Exception):
    def __init__(self, message, kind="failed"):
        super().__init__(message)
        self.kind = kind


def emit(doc, code=0):
    print(json.dumps(doc), flush=True)
    sys.exit(code)


def fail(message, kind="failed"):
    emit({"ok": False, "error": message, "kind": kind}, 1)


class Args(argparse.ArgumentParser):
    def error(self, message):  # argparse's exit 2 + usage on stderr would break the contract
        fail(message, "refused")


def ffmpeg_bin():
    return os.environ.get("FFMPEG") or "ffmpeg"


def read_audio(path):
    """(float32 samples shaped (frames, channels), rate), or Failure with the decoder's words."""
    import soundfile as sf

    if not os.path.isfile(path):
        raise Failure(f"no such file: {path}", "refused")
    try:
        data, rate = sf.read(path, dtype="float32", always_2d=True)
        return data, int(rate)
    except Exception as first:  # soundfile.LibsndfileError, or a format it does not read
        said_sf = str(first) or type(first).__name__
    fd, tmp = tempfile.mkstemp(suffix=".wav", prefix="gt-sidecar-")
    os.close(fd)
    try:
        try:
            r = subprocess.run([ffmpeg_bin(), "-v", "error", "-nostdin", "-y", "-i", path, "-vn", "-c:a", "pcm_f32le", "-f", "wav", tmp],
                               capture_output=True, text=True, timeout=300)
        except FileNotFoundError as e:
            raise Failure(f"soundfile: {said_sf}; ffmpeg: {e}") from None
        except subprocess.TimeoutExpired:
            raise Failure(f"soundfile: {said_sf}; ffmpeg did not decode {path} in 300 s") from None
        if r.returncode != 0:
            tail = " | ".join(r.stderr.strip().splitlines()[-3:])
            raise Failure(f"ffmpeg decode: {tail or 'exit ' + str(r.returncode)}")
        data, rate = sf.read(tmp, dtype="float32", always_2d=True)
        return data, int(rate)
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass


def cmd_measure(a):
    import loudness

    data, rate = read_audio(a.input)
    emit({"ok": True, "measure": loudness.measure(data, rate)})


def _load_chain(arg):
    text = arg
    if not arg.lstrip().startswith("{"):
        try:
            with open(arg, encoding="utf-8") as f:
                text = f.read()
        except OSError as e:
            raise Failure(f"chain file: {e}", "refused") from None
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise Failure(f"chain is not JSON: {e}", "refused") from None


def cmd_fx(a):
    import numpy as np
    import soundfile as sf

    import fxchain
    import loudness

    try:
        stages = fxchain.validate(_load_chain(a.chain))
    except fxchain.ChainRefused as e:
        raise Failure(str(e), "refused") from None
    data, rate = read_audio(a.input)
    out, notes = fxchain.render(data, rate, stages)
    gain_db = 0.0
    tp = loudness.true_peak_db(out, rate)
    if tp is not None and tp > CEILING_DBTP:
        gain_db = TARGET_DBTP - tp
        out = (out * np.float32(10.0 ** (gain_db / 20.0))).astype(np.float32)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    part = a.out + ".part.wav"
    sf.write(part, out, rate, subtype="PCM_16", format="WAV")
    os.replace(part, a.out)
    written, _ = sf.read(a.out, dtype="float32", always_2d=True)
    emit({
        "ok": True,
        "durationS": round(written.shape[0] / rate, 4),
        "gainDb": round(gain_db, 2),
        "truePeakDb": None if (w := loudness.true_peak_db(written, rate)) is None else round(w, 2),
        "rate": rate,
        "channels": int(written.shape[1]),
        "notes": notes,
    })


def cmd_triage(a):
    import triage

    try:
        with open(a.context, encoding="utf-8") as f:
            text = f.read()
    except OSError as e:
        raise Failure(f"context file: {e}", "refused") from None
    try:
        ctx = triage.validate_context(json.loads(text))
    except json.JSONDecodeError as e:
        raise Failure(f"context is not JSON: {e}", "refused") from None
    except triage.ContextRefused as e:
        raise Failure(f"context {e}", "refused") from None
    data, rate = read_audio(a.input)
    emit({"ok": True, "triage": triage.run(data, rate, ctx)})


def cmd_render_score(a):
    import render_score

    try:
        with open(a.spec, encoding="utf-8") as f:
            text = f.read()
    except OSError as e:
        raise Failure(f"spec file: {e}", "refused") from None
    try:
        spec_doc = json.loads(text)
    except json.JSONDecodeError as e:
        raise Failure(f"spec is not JSON: {e}", "refused") from None
    try:
        res = render_score.render_score(
            spec_doc,
            a.out_dir,
            cache_dir=a.cache_dir,
            verify_determinism=bool(a.verify_determinism),
        )
    except render_score.ScoreRefused as e:
        raise Failure(f"score spec: {e}", "refused") from None
    emit(res)


def cmd_audition(a):
    import score_instruments

    try:
        res = score_instruments.audition_instrument(a.instrument, out_path=a.out)
    except ValueError as e:
        raise Failure(str(e), "refused") from None
    emit(res)


def _dist_version(name):
    from importlib import metadata

    try:
        return metadata.version(name)
    except metadata.PackageNotFoundError:
        return ""


def cmd_doctor(_a):
    modules, missing, errors, versions = [], [], {}, {}
    for name in REQUIRED:
        try:
            m = importlib.import_module(name)
        except Exception as e:  # ImportError, or an OSError from a missing native library
            missing.append(name)
            errors[name] = str(e) or type(e).__name__
            continue
        modules.append(name)
        versions[name] = str(getattr(m, "__version__", "") or _dist_version(name))
    emit({"ok": True, "python": sys.version, "modules": modules, "missing": missing, "errors": errors,
          "versions": versions, "ffmpeg": shutil.which(ffmpeg_bin())})


def main(argv):
    p = Args(prog="sidecar.py")
    sub = p.add_subparsers(dest="verb", required=True)
    m = sub.add_parser("measure")
    m.add_argument("--in", dest="input", required=True)
    m.add_argument("--json", action="store_true")
    f = sub.add_parser("fx")
    f.add_argument("--in", dest="input", required=True)
    f.add_argument("--chain", required=True)
    f.add_argument("--out", required=True)
    f.add_argument("--json", action="store_true")
    t = sub.add_parser("triage")
    t.add_argument("--in", dest="input", required=True)
    t.add_argument("--context", required=True)
    t.add_argument("--json", action="store_true")
    rs = sub.add_parser("render-score")
    rs.add_argument("--spec", required=True)
    rs.add_argument("--out-dir", dest="out_dir", required=True)
    rs.add_argument("--cache-dir", dest="cache_dir", default=None)
    rs.add_argument("--verify-determinism", dest="verify_determinism", action="store_true")
    rs.add_argument("--json", action="store_true")
    au = sub.add_parser("audition")
    au.add_argument("--instrument", required=True)
    au.add_argument("--out", default=None)
    au.add_argument("--json", action="store_true")
    d = sub.add_parser("doctor")
    d.add_argument("--json", action="store_true")
    a = p.parse_args(argv)
    run = {
        "measure": cmd_measure,
        "fx": cmd_fx,
        "triage": cmd_triage,
        "render-score": cmd_render_score,
        "audition": cmd_audition,
        "doctor": cmd_doctor,
    }[a.verb]
    try:
        run(a)
    except Failure as e:
        fail(str(e), e.kind)
    except ImportError as e:
        fail(str(e), "missing-module")
    except Exception as e:  # the tool's own sentence; the class only when it said nothing
        fail(str(e) or type(e).__name__)


if __name__ == "__main__":
    main(sys.argv[1:])
