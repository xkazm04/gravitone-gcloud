"""The audio sidecar: measure a file, render a voice-fx chain, triage a take, render a ScoreSpec, or audition.

    python pipeline/audio/sidecar.py measure --in <wav|mp3|m4a|...> --json
      -> {"ok":true,"measure":{integratedLufs,truePeakDb,lra,clippedSamples,leadSilenceS,tailSilenceS,durationS}}
    python pipeline/audio/sidecar.py fx --in <wav> --chain <chain.json | inline JSON> --out <wav> --json
      -> {"ok":true,"durationS":n,"gainDb":g,"truePeakDb":tp,"rate":r,"channels":c,"notes":[...]}
    python pipeline/audio/sidecar.py triage --in <file> --context <context.json> --json
      -> {"ok":true,"triage":{"version":1,"findings":[{check,defect?,verdict,value,threshold,unit,atS?,note?}],"flagged":n}}
    python pipeline/audio/sidecar.py render-score --spec <spec.json> --out-dir <dir> [--cache-dir <dir>] [--verify-determinism] [--allow-fallback] --json
      -> {"ok":true,"title":...,"mixPath":...,"mixSha256":...,"measure":{...},"triage":{...},"stems":[...],"reusedIds":[...],"renderedIds":[...],"determinism":...}
      (a stand-in source is refused, naming the missing sample path or plugin, unless --allow-fallback)
    python pipeline/audio/sidecar.py audition-instrument --instrument <id> [--role <studio role>] [--out <wav>] --json
      -> {"ok":true,"id":...,"audition":{...}}   (one catalog instrument, the local-band engine)
    python pipeline/audio/sidecar.py render|render-midi|render-stem --midi <mid> --instrument <id> --out <wav> [--brightness b] --json
    python pipeline/audio/sidecar.py sketch-score [--style s] --out-dir <dir> [--seed n] [--bpm b] [--key k] [--verify-determinism] --json
    python pipeline/audio/sidecar.py audition --spec <spec.json> --out <wav> --json   (one atlas family's phrase)
    python pipeline/audio/sidecar.py sketch --spec <spec.json> --out <wav> --json     (painted energy levels)
    python pipeline/audio/sidecar.py serve   (the warm worker: one JSON request per stdin line, lib/audio/renderWorker.ts;
      verbs audition, sketch, render-score - serve_score.py)
    python pipeline/audio/sidecar.py doctor --json
      -> {"ok":true,"python":"<sys.version>","modules":[...],"missing":[...],"errors":{...},"versions":{...},"ffmpeg":path|null}

The one consumer is lib/audio/sidecar.ts; docs/audio-sidecar.md is the operator's page.

CONTRACT: stdout's LAST line is one JSON object, whatever happened. A failure is
{"ok":false,"error":"<the underlying tool's own sentence>","kind":...} and exit code 1, where
kind is "missing-module" (an import failed: the error IS Python's ImportError sentence),
"refused" (the chain, the triage context, or the arguments), or "failed" (decode, render,
write). Nothing is paraphrased: an operator reading the Node error reads what soundfile, ffmpeg
or pedalboard said.

Only the standard library is imported at module top, so `doctor` and a missing-module failure
still answer in JSON on a Python with none of the requirements installed.

DECODE: soundfile first (wav, flac, ogg, and mp3 on libsndfile >= 1.1); anything it refuses
goes through ffmpeg (`FFMPEG` or ffmpeg on PATH) to a temp float wav at the file's own rate
and channel count, then soundfile. Blob files carry no extension, so the format is never
guessed from the name.

OUTPUT of `fx`: 16-bit PCM WAV at the input's sample rate and channel count - what every
browser plays and every ffmpeg reads. PEAK PROTECTION: when the rendered true peak is above
-1 dBTP (the voice-take ceiling, packages/domain/src/audio.accept.ts) a final gain sets it to
-1.1 dBTP before quantisation (the 0.1 dB is the margin a 16-bit write may move it by);
`gainDb` is that gain, 0 when none was needed, and `truePeakDb` is measured on the file as
written.
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
        this_kind = kind
        self.kind = this_kind


def emit(doc, code=0):
    print(json.dumps(doc), flush=True)
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(code)


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
    import serve_score

    try:
        with open(a.spec, encoding="utf-8") as f:
            text = f.read()
    except OSError as e:
        raise Failure(f"spec file: {e}", "refused") from None
    try:
        spec_doc = json.loads(text)
    except json.JSONDecodeError as e:
        raise Failure(f"spec is not JSON: {e}", "refused") from None
    res = serve_score.answer(spec_doc, a.out_dir, a.cache_dir, bool(a.verify_determinism), bool(a.allow_fallback))
    if not res.get("ok"):
        raise Failure(res["error"], res["kind"])
    emit(res)


def cmd_audition_instrument(a):
    import score_instruments

    try:
        res = score_instruments.audition_instrument(a.instrument, out_path=a.out, role=a.role)
    except ValueError as e:
        raise Failure(str(e), "refused") from None
    emit(res)


def cmd_render_midi(a):
    import render_score

    try:
        res = render_score.render_midi_file(a.midi, a.instrument, a.out, brightness=float(a.brightness))
    except render_score.ScoreRefused as e:
        raise Failure(str(e), "refused") from None
    emit(res)


def cmd_sketch_score(a):
    import render_score

    try:
        res = render_score.sketch_score(
            style=a.style, out_dir=a.out_dir, seed=a.seed, tempo_bpm=a.bpm, key=a.key,
            verify_determinism=bool(a.verify_determinism), allow_fallback=bool(a.allow_fallback),
        )
    except render_score.ScoreRefused as e:
        raise Failure(f"sketch: {e}", "refused") from None
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


def cmd_audition(a):
    from audition import cmd_audition as run

    run(a, emit, Failure)


def cmd_serve(_a):
    import io

    from serve_score import serve

    # UTF-8 both ways, whatever the console's code page: a request carries sample paths, and Node
    # writes them as UTF-8 (a "Cafe Keys" folder with an accent read as cp1252 is a missing file).
    serve(io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8"), io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True))


def cmd_sketch(a):
    from audition import cmd_audition as run
    from sketch import render_sketch

    run(a, emit, Failure, render_sketch)


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
    rs.add_argument("--allow-fallback", dest="allow_fallback", action="store_true")
    rs.add_argument("--json", action="store_true")
    au = sub.add_parser("audition-instrument")
    au.add_argument("--instrument", required=True)
    au.add_argument("--role", default=None)
    au.add_argument("--out", default=None)
    au.add_argument("--json", action="store_true")
    for rverb in ("render", "render-midi", "render-stem"):
        rm = sub.add_parser(rverb)
        rm.add_argument("--midi", required=True)
        rm.add_argument("--instrument", required=True)
        rm.add_argument("--out", required=True)
        rm.add_argument("--brightness", default=0.5, type=float)
        rm.add_argument("--json", action="store_true")
    sk = sub.add_parser("sketch-score")
    sk.add_argument("--style", default="chill-hiphop")
    sk.add_argument("--out-dir", dest="out_dir", required=True)
    sk.add_argument("--seed", default=None, type=int)
    sk.add_argument("--bpm", default=None, type=float)
    sk.add_argument("--key", default=None)
    sk.add_argument("--verify-determinism", dest="verify_determinism", action="store_true")
    sk.add_argument("--allow-fallback", dest="allow_fallback", action="store_true")
    sk.add_argument("--json", action="store_true")
    d = sub.add_parser("doctor")
    d.add_argument("--json", action="store_true")
    au = sub.add_parser("audition")
    au.add_argument("--spec", required=True)
    au.add_argument("--out", required=True)
    au.add_argument("--json", action="store_true")
    sv = sub.add_parser("serve")
    sv.add_argument("--json", action="store_true")
    sk = sub.add_parser("sketch")
    sk.add_argument("--spec", required=True)
    sk.add_argument("--out", required=True)
    sk.add_argument("--json", action="store_true")
    a = p.parse_args(argv)
    run = {
        "measure": cmd_measure,
        "fx": cmd_fx,
        "triage": cmd_triage,
        "render-score": cmd_render_score,
        "audition-instrument": cmd_audition_instrument,
        "render": cmd_render_midi,
        "render-midi": cmd_render_midi,
        "render-stem": cmd_render_midi,
        "sketch-score": cmd_sketch_score,
        "audition": cmd_audition,
        "sketch": cmd_sketch,
        "serve": cmd_serve,
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
