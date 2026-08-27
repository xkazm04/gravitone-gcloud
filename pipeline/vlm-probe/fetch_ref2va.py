"""Fetch the MiniMax H3 Ref2VA checkpoint -- the reference-conditioned video model.

    python fetch_ref2va.py            # download, resumable
    python fetch_ref2va.py --check    # is it here yet?

Approach 3 for *stills* turned out to need no download at all: `ReferenceLatent`
was already installed and Flux 2 chains it. This is the other half -- carrying a
reference into **motion**, which is the one thing on the still side's critical
path that genuinely is not on the disk.

Two files, ~23 GB:

  ref2va_pruned_fp8_scaled   the same variant as the FL2VA checkpoint already
                             here, so it loads under the same memory budget that
                             is known to work on this box.
  ref2v turbo 4-step LoRA    the turbo LoRA already on disk is the **fl2v** one
                             and does not match this checkpoint. 2 GB for a 4x
                             step reduction is the cheapest speedup available.

Resumable by design: `hf_hub_download` picks up where it left off, so a killed
run costs the current chunk and nothing else. Run it detached -- a foreground
command window dies at ~10 minutes and takes the download with it.
"""

import argparse
import os
import sys
import time
from pathlib import Path

# hf_xet hung on this box: the process stayed alive for 30 minutes, logged
# "fetching", and wrote zero bytes -- no error, no progress, the silent failure
# this whole pipeline keeps meeting. Plain HTTP is slower and it works, and a
# 21 GB download that finishes beats a fast one that does not start.
os.environ["HF_HUB_DISABLE_XET"] = "1"

REPO = "Comfy-Org/MiniMax-H3"
COMFY_MODELS = Path(r"C:\Users\kazda\ComfyUI\models")

WANTED = [
    ("diffusion_models/minimax_h3_ref2va_pruned_fp8_scaled.safetensors", 20.96),
    ("loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors", 1.96),
]


def target(remote):
    return COMFY_MODELS / remote


def check():
    ok = True
    for remote, gb in WANTED:
        p = target(remote)
        if p.exists():
            have = p.stat().st_size / 1e9
            good = have > gb * 0.98
            print(f"  {'OK  ' if good else 'PART'} {p.name}  {have:.2f} / {gb:.2f} GB")
            ok = ok and good
        else:
            print(f"  MISS {p.name}  0 / {gb:.2f} GB")
            ok = False
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    if args.check:
        sys.exit(0 if check() else 1)

    from huggingface_hub import hf_hub_download
    for remote, gb in WANTED:
        dest = target(remote)
        if dest.exists() and dest.stat().st_size > gb * 0.98e9:
            print(f"  already have {dest.name}")
            continue
        print(f"  fetching {remote}  (~{gb:.1f} GB)", flush=True)
        t = time.time()
        # Every download path tried on this box stalled at least once with the
        # process alive, the byte count frozen and no exception ever raised --
        # hf_xet wrote zero bytes in 30 minutes, plain HTTP froze at 7 GB, curl
        # dropped to 500 kB/s. The `.incomplete` in the cache is resumable, so
        # the cure for a stall is to start again and let it pick up. Retry here
        # rather than trusting any single attempt to carry 21 GB to the end.
        got = None
        for attempt in range(1, 13):
            try:
                got = hf_hub_download(repo_id=REPO, filename=remote,
                                      local_dir=str(COMFY_MODELS))
                break
            except Exception as e:
                print(f"    attempt {attempt} failed ({type(e).__name__}: {e}); "
                      f"resuming from the partial", flush=True)
                time.sleep(10)
        if got is None:
            print(f"    GAVE UP on {remote}", flush=True)
            continue
        mins = (time.time() - t) / 60
        size = Path(got).stat().st_size / 1e9
        print(f"  -> {got}  {size:.2f} GB in {mins:.1f} min "
              f"({size * 1000 / max(mins * 60, 1):.0f} MB/s)", flush=True)
    print("\nfinal state:")
    check()


if __name__ == "__main__":
    main()
