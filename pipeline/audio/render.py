"""A0 instrument catalog render verb (pipeline/audio/render.py).

Usage:
  python pipeline/audio/render.py --midi <file.mid> --instrument <catalog id> --out <out.wav>
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import render_score
import score_instruments as inst_lib

ScoreRefused = render_score.ScoreRefused
render_midi_file = render_score.render_midi_file
read_smf_midi = render_score.read_smf_midi
CATALOG = inst_lib.CATALOG


def main(argv=None):
    ap = argparse.ArgumentParser(prog="render.py", description="Render an SMF MIDI file through a catalog instrument.")
    ap.add_argument("--midi", required=True, help="Input Standard MIDI File (.mid)")
    ap.add_argument("--instrument", required=True, help="Catalog instrument ID")
    ap.add_argument("--out", required=True, help="Output WAV path")
    ap.add_argument("--brightness", type=float, default=0.5, help="Brightness control 0..1")
    args = ap.parse_args(argv)
    try:
        res = render_midi_file(args.midi, args.instrument, args.out, brightness=args.brightness)
        sys.stdout.write(json.dumps(res) + "\n")
        sys.stdout.flush()
        os._exit(0)
    except ScoreRefused as e:
        sys.stdout.write(json.dumps({"ok": False, "code": "refused", "error": str(e)}) + "\n")
        sys.stdout.flush()
        os._exit(2)


if __name__ == "__main__":
    main()
