#!/usr/bin/env bash
# Direct, resumable, watchable. Two library paths (hf_xet, then plain HTTP via
# huggingface_hub) both stalled silently on this box -- alive process, zero
# progress, no error. curl -C - resumes into the final path, so progress is
# visible as the file's own size and a stall costs a retry, not a restart.
set -u
BASE="https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main"
M="C:/Users/kazda/ComfyUI/models"
fetch() {  # remote_rel  dest_abs
  echo "== $1"
  for attempt in 1 2 3 4 5 6 7 8; do
    curl -L --fail --retry 5 --retry-delay 5 --retry-all-errors \
         --connect-timeout 30 --speed-limit 1048576 --speed-time 60 \
         -C - -o "$2" "$BASE/$1" && { echo "   done"; return 0; }
    echo "   attempt $attempt stalled/failed, resuming..."
    sleep 5
  done
  echo "   GAVE UP on $1"; return 1
}
fetch "diffusion_models/minimax_h3_ref2va_pruned_fp8_scaled.safetensors" \
      "$M/diffusion_models/minimax_h3_ref2va_pruned_fp8_scaled.safetensors"
fetch "loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors" \
      "$M/loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors"
echo "ALL DONE"
