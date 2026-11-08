#!/bin/bash
# The scoring + post venv, YUE2_HOME/.venv-eval (no sudo; moved from kiro/yue2-lab wp1/install.sh).
# Run from Windows: wsl.exe -d Ubuntu --exec bash /mnt/c/<repo>/pipeline/yue2/install-eval.sh
# Idempotent: an existing venv is reused and uv skips what is installed. NEVER touches YUE2_HOME/.venv.
set -euo pipefail
export PATH=$HOME/.local/bin:/usr/lib/wsl/lib:$PATH
H=${YUE2_HOME:-$HOME/yue2-lab}
command -v uv >/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh
mkdir -p "$H" && cd "$H"
[ -d .venv-eval ] || uv venv --python 3.11 .venv-eval
. .venv-eval/bin/activate
# No C compiler on a stock WSL box: diffq (an audio-separator dep) builds with zig as cc; zig rejects -Wl,--exclude-libs.
uv pip install ziglang
mkdir -p "$H/.eval-bin"
cat > "$H/.eval-bin/cc" <<X
#!/bin/bash
args=()
for a in "\$@"; do case "\$a" in -Wl,--exclude-libs*) ;; *) args+=("\$a");; esac; done
exec "$H/.venv-eval/bin/python" -m ziglang cc "\${args[@]}"
X
cp "$H/.eval-bin/cc" "$H/.eval-bin/gcc"
chmod +x "$H/.eval-bin/cc" "$H/.eval-bin/gcc"
export PATH=$H/.eval-bin:$PATH CC=$H/.eval-bin/cc
# torch pinned to the cu128 build: unpinned resolves torch 2.15 + CUDA-13 libs, which breaks CTranslate2 (needs cuBLAS 12).
uv pip install torch==2.10.0 torchaudio==2.10.0 qwen-asr "audio-separator[gpu]" faster-whisper jiwer phonemizer \
  pyloudnorm audiobox_aesthetics espeakng-loader librosa imageio-ffmpeg muq==0.1.0 hydra-core==1.3.2 zhconv \
  matchering pedalboard
# ffmpeg for audio-separator (the static binary imageio-ffmpeg ships)
ln -sf "$(python -c 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())')" "$H/.eval-bin/ffmpeg"
# SongEval (code + checkpoint in its repo; MuQ weights come from HF on first use)
mkdir -p "$H/ext" && cd "$H/ext" && { [ -d SongEval ] || git clone --depth 1 https://github.com/ASLP-lab/SongEval; }
echo "eval venv ready: $H/.venv-eval"
