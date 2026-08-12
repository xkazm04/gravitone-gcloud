"""VTT -> de-overlapped transcript. YouTube rolling captions repeat the tail of
the previous cue at the head of the next, so dedupe at WORD level: for each cue,
find the longest suffix of what we already have that prefixes this cue, and keep
only the remainder."""
import io, re, sys, os

def cues(path):
    raw = io.open(path, encoding="utf-8").read()
    ts = re.compile(r"^(\d\d):(\d\d):(\d\d)\.(\d\d\d) --> ")
    out, cur, buf = [], None, []
    for ln in raw.splitlines():
        m = ts.match(ln)
        if m:
            if cur is not None and buf:
                out.append((cur, " ".join(buf)))
            h, mi, s, _ = map(int, m.groups())
            cur, buf = h * 3600 + mi * 60 + s, []
            continue
        if ln.startswith(("WEBVTT", "Kind:", "Language:", "NOTE")) or not ln.strip():
            continue
        t = re.sub(r"<[^>]+>", "", ln)
        t = t.replace("[&nbsp;__&nbsp;]", "[bleep]").replace("&nbsp;", " ")
        t = re.sub(r"\s+", " ", t).strip()
        if t:
            buf.append(t)
    if cur is not None and buf:
        out.append((cur, " ".join(buf)))
    return out

def deoverlap(cs):
    """-> [(t, new_text)] and the flat word list."""
    words, stamped = [], []
    for t, txt in cs:
        w = txt.split()
        if not w:
            continue
        k = min(len(words), len(w), 40)
        overlap = 0
        while k > 0:
            if words[-k:] == w[:k]:
                overlap = k
                break
            k -= 1
        new = w[overlap:]
        if new:
            stamped.append((t, " ".join(new)))
            words.extend(new)
    return stamped, words

for path in sys.argv[1:]:
    stamped, w = deoverlap(cues(path))
    dur = cues(path)[-1][0]
    io.open(path + ".txt", "w", encoding="utf-8").write(" ".join(w))
    io.open(path + ".stamped.txt", "w", encoding="utf-8").write(
        "\n".join(f"[{t//60:02d}:{t%60:02d}] {x}" for t, x in stamped))
    print(f"{os.path.basename(path)}: {len(w)} words / {dur}s = {len(w)/max(dur,1)*60:.0f} wpm")
