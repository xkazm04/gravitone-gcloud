import io, re, sys, statistics as st

def load(p):
    """Read a transcript. Strips [mm:ss] / [hh:mm:ss] cue stamps — the committed
    corpus files are the STAMPED variant, and their timestamps are digit tokens that
    otherwise land in the numeric counts (measured: MinuteEarth read 269/1k numerals
    stamped, against a true 0)."""
    t = io.open(p, encoding="utf-8").read()
    return re.sub(r"\[\d{1,2}:\d{2}(?::\d{2})?\]", " ", t)

def metrics(name, txt, dur):
    w = txt.split()
    n = len(w)
    punctuated = txt.count(".") + txt.count("?") > n / 60
    out = {"name": name, "words": n, "dur": dur, "wpm": round(n / dur * 60)}
    if punctuated:
        sents = [s.strip() for s in re.split(r"(?<=[.?!])\s+", txt) if s.strip()]
        lens = [len(s.split()) for s in sents]
        out["sentences"] = len(sents)
        out["sent_mean"] = round(st.mean(lens), 1)
        out["sent_median"] = st.median(lens)
        out["sent_max"] = max(lens)
        out["sent_under8"] = sum(1 for l in lens if l <= 7)
        out["sent_over25"] = sum(1 for l in lens if l > 25)
        out["questions"] = sum(1 for s in sents if s.rstrip().endswith("?"))
    low = " " + txt.lower() + " "
    per_1k = lambda c: round(c / n * 1000, 1)
    out["you_per1k"] = per_1k(len(re.findall(r"\b(you|your|you're|yourself)\b", low)))
    out["we_per1k"] = per_1k(len(re.findall(r"\b(we|our|we're|us)\b", low)))
    out["i_per1k"] = per_1k(len(re.findall(r"\b(i|i'm|my|me)\b", low)))
    # Numeric EXPRESSIONS, not digit tokens. A spoken script writes "one hundred and
    # twenty six thousand"; an ASR transcript writes "126,198". Counting digits alone
    # made corpus figures (ASR) and generated-script figures (written out) differ by
    # ~8x on identical facts, which silently breaks any comparison between a tone
    # profile learned from the corpus and a script measured here. A run of adjacent
    # number-words counts as ONE expression, exactly like a numeral does.
    NUMWORD = (r"(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve"
               r"|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty"
               r"|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand"
               r"|million|billion|trillion|half|quarter|dozen|point|percent)")
    #
    # BOTH are reported, and they are NOT interchangeable:
    #   numerals_per1k  — digit tokens only. What every published corpus figure in
    #                     knowledge/**/sources/*.md was measured with. Valid for
    #                     comparing ASR transcript against ASR transcript.
    #   numeric_per1k   — digits + written-out runs. The only measure that can compare
    #                     a written script against an ASR transcript.
    # Even numeric_per1k is not perfectly comparable as a RATE, because writing
    # numbers out inflates the word count (the denominator). Compare raw counts when
    # it matters; the counts are printed alongside.
    numerals = re.findall(r"\b\d[\d,.]*\b", txt)
    allnum = re.findall(
        r"\b\d[\d,.]*\b|\b" + NUMWORD + r"(?:[\s-]+(?:and[\s-]+)?" + NUMWORD + r")*\b", low)
    out["numerals_per1k"] = per_1k(len(numerals))
    out["numeric_per1k"] = per_1k(len(allnum))
    out["numeric_count"] = len(allnum)
    out["hedges_per1k"] = per_1k(len(re.findall(
        r"\b(seems|seemingly|apparently|roughly|about|around|likely|probably|arguably|effectively|something of)\b", low)))
    out["connectives_per1k"] = per_1k(len(re.findall(
        r"\b(but|so|because|however|although|which means|that means|the problem is|the catch)\b", low)))
    out["imperatives"] = len(re.findall(
        r"(?:^|[.?!]\s+)(use|create|open|install|delete|run|make|notice|copy|paste|move|increment|decrement|enter|click|type)\b",
        txt, re.I))
    out["contractions_per1k"] = per_1k(len(re.findall(r"\b\w+'(s|re|ll|ve|t|d|m)\b", low)))
    return out

for arg in sys.argv[1:]:
    path, dur = arg.rsplit("=", 1)
    m = metrics(path.split("--")[0], load(path), int(dur))
    print(f"\n--- {path}")
    for k, v in m.items():
        print(f"  {k:20} {v}")
