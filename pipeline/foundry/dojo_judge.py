"""Dojo judging helpers: blind the pairs, run the Gemini joint judge, park.

    python dojo_judge.py prepare foundry-out/training/<cycle-id>
        reads gen-spec.json + readbacks.json, writes judging-worksheet.json
        (per-pair randomized A/B maps, one per judge), choke-blind.json (the
        chokepoint judge's document: target claim + the two readbacks as A/B,
        challenger identity withheld) and gemini-picks.json (both images plus
        the claim in one request, A/B order randomized independently).

    python dojo_judge.py park foundry-out/training/<cycle-id> <choke-picks.json>
        unblinds both judges' picks, writes the pairs into cycle.json's
        improvement, computes judge_pick_rate / gemini agreement, sets
        awaiting-gate, appends the consult line.

The chokepoint PICK itself is not made here -- it is a reasoning turn over
choke-blind.json (a dispatched subagent), whose answer is the JSON array this
script's `park` takes. The protocol is references/judge-protocol.md in the
dojo skill: one pick, one reason, ties allowed, never scores.
"""
import base64
import datetime
import json
import random
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
MODELS = ["gemini-3.6-flash", "gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.6-flash"]


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def key():
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith("GOOGLE_AI_API_KEY="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("GOOGLE_AI_API_KEY not in .env")


def gemini(model, claim, cdir, pid, a_arm):
    b_arm = "challenger" if a_arm == "baseline" else "baseline"
    parts = [{"text": (
        f"Target (the improvement's claim, judge ONLY this): {claim}\n\n"
        "Two generated images of the same scene and seed follow, labeled A then B. Which one better "
        "realises the target? Judge the property named in the target, not overall prettiness. "
        "Strict JSON: {\"pick\":\"A\"|\"B\"|\"tie\",\"reason\":\"<one sentence naming the deciding difference>\"}. "
        "If no concrete difference decides it, pick \"tie\".")}]
    for label, arm in (("A", a_arm), ("B", b_arm)):
        data = base64.b64encode((cdir / "pairs" / f"{pid}--{arm}.png").read_bytes()).decode()
        parts.append({"text": f"Image {label}:"})
        parts.append({"inline_data": {"mime_type": "image/png", "data": data}})
    body = {"contents": [{"parts": parts}],
            "generationConfig": {"temperature": 0, "response_mime_type": "application/json"}}
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key()}"
    req = urllib.request.Request(url, json.dumps(body).encode(), {"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(json.load(resp)["candidates"][0]["content"]["parts"][0]["text"])


def prepare(cdir, no_gemini=False):
    spec = json.loads((cdir / "gen-spec.json").read_text(encoding="utf-8"))
    rb = json.loads((cdir / "readbacks.json").read_text(encoding="utf-8"))
    cycle = json.loads((cdir / "cycle.json").read_text(encoding="utf-8"))
    claim = cycle["improvements"][0]["claim"]
    rng = random.Random(cdir.name)
    work, blind, gem = [], [], {}
    for p in spec["pairs"]:
        pid = p["id"]
        video = (cdir / "pairs" / f"{pid}--baseline.webm").exists()
        ext = ".webm" if video else ".png"
        if not all((cdir / "pairs" / f"{pid}--{arm}{ext}").exists() for arm in ("baseline", "challenger")):
            print(f"  skip {pid}: incomplete duo", flush=True)
            continue
        w = {"id": pid, "seed": p.get("seed"),
             "choke_A": rng.choice(["baseline", "challenger"]),
             "gem_A": rng.choice(["baseline", "challenger"]),
             "readback": {arm: rb.get(f"{pid}--{arm}", {}) for arm in ("baseline", "challenger")}}
        if video:
            for arm in ("baseline", "challenger"):
                w[f"{arm}_ref"] = {"file": f"pairs/{pid}--{arm}.webm", "kind": "video",
                                   "poster": f"pairs/{pid}--{arm}--t1.png"}
        work.append(w)
        a, b = w["choke_A"], ("challenger" if w["choke_A"] == "baseline" else "baseline")
        blind.append({"pair": pid, "A": w["readback"][a], "B": w["readback"][b]})
        if no_gemini:
            gem[pid] = {"skipped": "operator: no gemini this dimension"}
            continue
        got = None
        for attempt, model in enumerate(MODELS):
            try:
                got = gemini(model, claim, cdir, pid, w["gem_A"])
                got["model"] = model
                break
            except urllib.error.HTTPError as e:
                if e.code in (429, 500, 503):
                    time.sleep(8 * (attempt + 1))
                    continue
                got = {"error": f"HTTP {e.code}"}
                break
            except Exception as e:  # noqa: BLE001
                got = {"error": str(e)[:200]}
                break
        gem[pid] = got or {"error": "retries exhausted"}
        print(f"  gemini {pid} -> {gem[pid]}", flush=True)
    (cdir / "judging-worksheet.json").write_text(json.dumps(work, indent=1), encoding="utf-8")
    (cdir / "choke-blind.json").write_text(json.dumps({"target": claim, "pairs": blind}, indent=1), encoding="utf-8")
    (cdir / "gemini-picks.json").write_text(json.dumps(gem, indent=1), encoding="utf-8")
    print(f"prepared {len(work)} pair(s)", flush=True)


def unblind(pick, a_arm):
    if pick == "tie":
        return "tie"
    return a_arm if pick == "A" else ("challenger" if a_arm == "baseline" else "baseline")


def park(cdir, choke_path):
    work = json.loads((cdir / "judging-worksheet.json").read_text(encoding="utf-8"))
    gem = json.loads((cdir / "gemini-picks.json").read_text(encoding="utf-8"))
    choke = {c["pair"]: c for c in json.loads(Path(choke_path).read_text(encoding="utf-8"))}
    pairs, ch, an, ad, gch = [], 0, 0, 0, 0
    for w in work:
        pid = w["id"]
        cj = unblind(choke[pid]["pick"], w["choke_A"])
        skipped = "skipped" in gem.get(pid, {})
        gj = None if skipped else unblind(gem[pid].get("pick", "tie"), w["gem_A"])
        ch += cj == "challenger"
        gch += gj == "challenger"
        if gj is not None and cj != "tie" and gj != "tie":
            ad += 1
            an += cj == gj
        row = {"id": pid, "scene": pid.rsplit("-s", 1)[0], "seed": w["seed"],
               "baseline": w.get("baseline_ref", {"file": f"pairs/{pid}--baseline.png", "kind": "image"}),
               "challenger": w.get("challenger_ref", {"file": f"pairs/{pid}--challenger.png", "kind": "image"}),
               "judge_pick": cj, "reason": choke[pid]["reason"]}
        if gj is not None:
            row["gemini_pick"] = gj
            row["gemini_reason"] = gem[pid].get("reason", gem[pid].get("error", ""))
        pairs.append(row)
        print(f"  {pid:28s} choke={cj:10s} gemini={gj}", flush=True)
    rate = ch / len(pairs) if pairs else 0.0
    agr = (an / ad) if ad else None
    cy = json.loads((cdir / "cycle.json").read_text(encoding="utf-8"))
    imp = cy["improvements"][0]
    imp["pairs"] = pairs
    best = next((x for x in pairs if x["judge_pick"] == "challenger" and x.get("gemini_pick", "challenger") == "challenger"), None)
    imp["thumbnail"] = (best or pairs[0])["challenger"]["file"]
    cy["status"] = "awaiting-gate"
    cy.pop("lease", None)
    cy["log"].append({"at": now(), "msg": f"judged: chokepoint pick_rate {rate:.2f} ({ch}/{len(pairs)} challenger); "
                                          f"gemini challenger {gch}/{len(pairs)}; agreement "
                                          f"{'n/a' if agr is None else f'{agr:.2f}'} over {ad} decided pair(s)"})
    cy["log"].append({"at": now(), "msg": "parked awaiting-gate"})
    (cdir / "cycle.json").write_text(json.dumps(cy, indent=1, ensure_ascii=False), encoding="utf-8")
    with (ROOT / ".ai" / "consults.jsonl").open("a", encoding="utf-8") as f:
        f.write(json.dumps({"ts": now(), "bundle": "media-generation", "subjects": [imp["subject"]],
                            "techniques": [imp["technique"]], "deviations": 0}) + "\n")
    print(f"parked {cdir.name}: pick_rate={rate:.2f} gemini={gch}/{len(pairs)} agreement={agr}", flush=True)


if __name__ == "__main__":
    cmd, cdir = sys.argv[1], Path(sys.argv[2])
    if not cdir.is_absolute():
        cdir = ROOT / cdir
    if cmd == "prepare":
        prepare(cdir, no_gemini="--no-gemini" in sys.argv)
    elif cmd == "park":
        park(cdir, sys.argv[3])
    else:
        raise SystemExit("usage: dojo_judge.py prepare|park <cycle-dir> [choke-picks.json]")
