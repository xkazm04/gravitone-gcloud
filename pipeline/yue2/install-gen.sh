#!/bin/bash
# The generation venv, YUE2_HOME/.venv: YuE2's own wheel, which hard-pins torch==2.10.0 (cu128),
# transformers==4.57.6 and numpy==2.2.6. Commands from kiro/yue2-lab outputs/RUNLOG.md (2026-11-04).
# Run from Windows: wsl.exe -d Ubuntu --exec bash /mnt/c/<repo>/pipeline/yue2/install-gen.sh
# It only CREATES the venv: an existing YUE2_HOME/.venv is left exactly as it is.
set -euo pipefail
export PATH=$HOME/.local/bin:/usr/lib/wsl/lib:$PATH
H=${YUE2_HOME:-$HOME/yue2-lab}
if [ -x "$H/.venv/bin/python" ]; then echo "gen venv exists, unchanged: $H/.venv"; exit 0; fi
command -v uv >/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh
mkdir -p "$H/wheel" && cd "$H"
uv venv --python 3.11 .venv
. .venv/bin/activate
uv pip install huggingface-hub==0.36.2
(cd wheel && hf download m-a-p/YuE2-3B yue2_infer-0.1.5-py3-none-any.whl README.md --local-dir .)
uv pip install ./wheel/yue2_infer-0.1.5-py3-none-any.whl
# The weights (m-a-p/YuE2-3B 6.8 GB, m-a-p/YuE2-Vae 507 MB) download into ~/.cache/huggingface on the first render.
echo "gen venv ready: $H/.venv"
