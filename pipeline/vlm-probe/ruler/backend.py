"""The real backend: FaceNet + DINOv2 + DETR through identity.py's loaders.
Heavy imports happen on first use; `loads` counts model-load events."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
import identity as idn  # noqa: E402


class TorchBackend:
    def __init__(self):
        self.loads = 0
        self._ready = False

    def _ensure(self):
        if not self._ready:
            for kind in ("face", "dino", "detr"):
                idn._load(kind)
            self.loads += 1
            self._ready = True

    def revisions(self):
        self._ensure()
        import facenet_pytorch
        out = {"facenet": "vggface2@" + getattr(facenet_pytorch, "__version__", "unknown")}
        for key, kind, name in (("dinov2", "dino", idn.LOOK_MODEL), ("detr", "detr", idn.DETECTOR)):
            model = idn._load(kind)[1]
            rev = getattr(model.config, "_commit_hash", None) or "unknown"
            out[key] = f"{name.split('/')[-1]}@{rev}"
        return out

    def embed(self, path):
        self._ensure()
        from PIL import Image
        mt, _ = idn._load("face")
        im = Image.open(path).convert("RGB")
        face, size = None, None
        boxes, _p = mt.detect(im)
        if boxes is not None and len(boxes):
            x1, y1, x2, y2 = boxes[0]
            size = int(min(x2 - x1, y2 - y1))
            if size >= idn.MIN_FACE_PX:
                face, _conf = idn.face_vec(path)
        return {"face": face, "faceSizePx": size, "look": idn.look_vec(path)}

    def distance(self, a, b):
        return idn.cos(a, b)
