"""EmbeddingGemma 2 spike - text-side + audio-library cases on data that exists in this checkout.

READ docs/concepts/multimodal-embeddings-2026-10-07.md FIRST. It carries the measured state, the
setup traps (torchvision is required and the model card omits it; torchaudio.load needs TorchCodec,
so audio loads via soundfile), the pass bars, and the dispatch for the experiments this script does
NOT run - E1/E2 are blocked because a forge commit unlinks every rejected candidate
(commitRun in lib/foundry/store.ts unlinks them), so the negative class was destroyed at commit time.

Cosine between two unrelated texts is ~0.67 here: read RANKS and relative margins, never absolute
thresholds.

Original header follows.

"""
"""EmbeddingGemma 2 spike - text-side + audio-library cases on data that exists in this checkout.
Run: python pipeline/embeddings/spike.py   (needs sentence-transformers, torch, torchvision, torchaudio)
Pass bars are set in .vault/Spark/ideas/embeddinggemma2-multimodal-control.md BEFORE measuring."""
import json, sys, numpy as np, torch
from sentence_transformers import SentenceTransformer

m = SentenceTransformer("google/embeddinggemma-2", device="cpu", model_kwargs={"torch_dtype": torch.float32})
enc = lambda xs, **k: m.encode(xs, normalize_embeddings=True, batch_size=8, **k)

hunts = json.load(open("fixtures-out/sound/hunts.json"))["hunts"]
takes = [v for k, v in json.load(open("fixtures-out/sound/takes.json")).items() if k != "version"][0]

# ---- A. hunt diversity: do sibling variations collapse? --------------------------------------
nodes = [(h["id"], h["kind"], n["axis"], n["label"], n["prompt"]) for h in hunts for n in h["nodes"]]
E = enc([f"task: sentence similarity | query: {n[4]}" for n in nodes])
S = E @ E.T
hid = np.array([n[0] for n in nodes]); print(f"\n[A] hunt nodes: {len(nodes)} across {len(hunts)} hunts")
within, cross = [], []
for i in range(len(nodes)):
    same = [S[i, j] for j in range(len(nodes)) if j != i and hid[j] == hid[i]]
    oth = [S[i, j] for j in range(len(nodes)) if hid[j] != hid[i]]
    if same: within.append(max(same))
    cross.append(max(oth))
q = lambda a: [round(float(np.percentile(a, p)), 3) for p in (10, 50, 90)]
print(" nearest-sibling sim p10/p50/p90:", q(within)); print(" nearest-other-hunt sim p10/p50/p90:", q(cross))
pairs = sorted(((S[i, j], i, j) for i in range(len(nodes)) for j in range(i + 1, len(nodes)) if hid[i] == hid[j]), reverse=True)
print(" most-similar sibling pairs (would be culled first):")
for s, i, j in pairs[:5]: print(f"  {s:.3f}  [{nodes[i][2]}] {nodes[i][3]}  <->  [{nodes[j][2]}] {nodes[j][3]}")
print(" least-similar sibling pairs (the real variation):")
for s, i, j in pairs[-3:]: print(f"  {s:.3f}  [{nodes[i][2]}] {nodes[i][3]}  <->  [{nodes[j][2]}] {nodes[j][3]}")

# ---- B. novelty / already-made: idea text finds its own hunt's nodes ------------------------
Dn = enc([f"title: {n[3]} | text: {n[4]}" for n in nodes])
Qi = enc([f"task: search result | query: {h['idea']}" for h in hunts])
rr = []
for qi, h in enumerate(hunts):
    order = np.argsort(-(Qi[qi] @ Dn.T)); mine = [r for r, k in enumerate(order) if hid[k] == h["id"]]
    rr.append(1 / (mine[0] + 1)); print(f"[B] idea->nodes {h['id']}: first own node at rank {mine[0]+1}; own nodes in top-{len(mine)}: {sum(1 for k in order[:len(mine)] if hid[k]==h['id'])}/{len(mine)}")
print(" MRR:", round(float(np.mean(rr)), 3))

# ---- C. library search: text -> audio, known-item over fixture takes -------------------------
import torchaudio
def load(p):
    import soundfile as sf
    a, sr = sf.read(p, dtype="float32", always_2d=True); w = torch.from_numpy(a.mean(1))[None]
    return torchaudio.functional.resample(w, sr, 16000)[0].numpy()[: 16000 * 60]
ok = [t for t in takes if t.get("file")]
A = enc([{"audio": load(t["file"]["path"].replace("files/", "fixtures-out/sound/files/")), "text": "<|audio|>"} for t in ok])
for name, qs in (("title", [t["title"] for t in ok]), ("prompt", [t["prompt"] for t in ok])):
    Q = enc([f"task: search result | query: {x}" for x in qs]); R = Q @ A.T
    rank = [int((np.argsort(-R[i]) == i).nonzero()[0][0]) + 1 for i in range(len(ok))]
    print(f"[C] text({name})->audio over {len(ok)} takes: hit@1 {np.mean([r==1 for r in rank]):.2f}  hit@5 {np.mean([r<=5 for r in rank]):.2f}  median rank {int(np.median(rank))}  (chance hit@5 {5/len(ok):.2f})")
kinds = [t["kind"] for t in ok]
Q = enc([f"task: search result | query: {t['prompt']}" for t in ok]); R = Q @ A.T
print(" kind-purity of top-5 (music vs sfx):", round(float(np.mean([np.mean([kinds[j]==kinds[i] for j in np.argsort(-R[i])[:5]]) for i in range(len(ok))])), 3))
