"""The video pipeline's own gate: ledger adopt/waiver logic, no GPU.

    python pipeline/video/selftest.py

Stdlib only -- ledger.py is, by design, and nothing here imports numpy, PIL,
ffmpeg or ComfyUI. Same shape as pipeline/foundry/selftest.py.
"""
import importlib.util
import json
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).parent
FAILURES = []


def check(name, got, want):
    ok = got == want
    print(f"  {'ok  ' if ok else 'FAIL'}  {name}: got {got!r}, want {want!r}")
    if not ok:
        FAILURES.append(name)


def load(mod):
    spec = importlib.util.spec_from_file_location(mod, HERE / f"{mod}.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def row(seed, check_=None, engine="h3"):
    r = {"file": f"{engine}-{seed}.webm", "engine": engine, "seed": seed,
         "prompt": "Animate the image", "route": engine}
    if check_ is not None:
        r["check"] = check_
    return r


PASS = {"ok": True, "reasons": [], "checker": 1}
FAIL = {"ok": False, "reasons": ["the colours leave the style (0.18 < 0.55)"], "checker": 1}


def refuses(L, fn):
    try:
        fn()
    except L.LedgerError as e:
        return str(e)
    return None


def test_takes_accumulate_and_a_rerender_replaces_in_place():
    L = load("ledger")
    runs = Path(tempfile.mkdtemp())
    for s in (1, 2, 3, 4):
        L.add_take("p", row(s, PASS), runs)
    check("four takes", len(L.load("p", runs)["takes"]), 4)
    L.add_take("p", row(2, FAIL), runs)
    led = L.load("p", runs)
    check("same seed is the same take", len(led["takes"]), 4)
    check("replaced row keeps its slot", led["takes"][1]["check"]["ok"], False)


def test_adopt_passing_take_needs_no_waiver():
    L = load("ledger")
    runs = Path(tempfile.mkdtemp())
    L.add_take("p", row(1, PASS), runs)
    check("adopted", L.adopt("p", "h3-1.webm", runs=runs), {"take": "h3-1.webm"})
    t, w, problem = L.adopted_take("p", runs)
    check("no problem", problem, None)


def test_failed_or_unjudged_take_is_refused_without_a_waiver():
    L = load("ledger")
    runs = Path(tempfile.mkdtemp())
    L.add_take("p", row(1, FAIL), runs)
    L.add_take("p", row(2), runs)
    msg = refuses(L, lambda: L.adopt("p", "h3-1.webm", runs=runs))
    check("failed take refused, named, reason shown",
          msg is not None and "h3-1.webm" in msg and "colours leave the style" in msg, True)
    msg = refuses(L, lambda: L.adopt("p", "h3-2.webm", runs=runs))
    check("unjudged take refused", msg is not None and "never judged" in msg, True)
    check("blank waiver is not a waiver",
          refuses(L, lambda: L.adopt("p", "h3-1.webm", waiver="  ", runs=runs)) is not None, True)
    check("nothing adopted by the refusals", L.load("p", runs)["adopted"], None)


def test_waiver_adopts_a_failed_take_and_is_recorded():
    L = load("ledger")
    runs = Path(tempfile.mkdtemp())
    L.add_take("p", row(1, FAIL), runs)
    check("adopted with waiver",
          L.adopt("p", "h3-1.webm", waiver="  one green ball is on-brand  ", runs=runs),
          {"take": "h3-1.webm", "waiver": "one green ball is on-brand"})
    t, w, problem = L.adopted_take("p", runs)
    check("waiver surfaces", (w, problem), ("one green ball is on-brand", None))


def test_regrade_to_red_makes_an_unwaived_adoption_a_problem():
    L = load("ledger")
    runs = Path(tempfile.mkdtemp())
    L.add_take("p", row(1, PASS), runs)
    L.adopt("p", "h3-1.webm", runs=runs)
    L.set_check("p", "h3-1.webm", FAIL, runs)
    t, w, problem = L.adopted_take("p", runs)
    check("build must now refuse", problem is not None and "h3-1.webm" in problem, True)
    check("unknown take on regrade",
          refuses(L, lambda: L.set_check("p", "nope.webm", PASS, runs)) is not None, True)


def test_nothing_adopted_is_a_problem_and_missing_ledger_is_empty():
    L = load("ledger")
    runs = Path(tempfile.mkdtemp())
    check("empty ledger", L.load("ghost", runs), {"takes": [], "adopted": None})
    L.add_take("p", row(1, PASS), runs)
    t, w, problem = L.adopted_take("p", runs)
    check("unadopted", problem is not None and "no take is adopted" in problem, True)
    check("ledger.json is valid json",
          json.loads((runs / "p" / "ledger.json").read_text(encoding="utf-8"))["takes"][0]["seed"], 1)


TESTS = [
    test_takes_accumulate_and_a_rerender_replaces_in_place,
    test_adopt_passing_take_needs_no_waiver,
    test_failed_or_unjudged_take_is_refused_without_a_waiver,
    test_waiver_adopts_a_failed_take_and_is_recorded,
    test_regrade_to_red_makes_an_unwaived_adoption_a_problem,
    test_nothing_adopted_is_a_problem_and_missing_ledger_is_empty,
]


def main():
    for t in TESTS:
        print(t.__name__)
        t()
    print()
    if FAILURES:
        sys.exit(f"selftest: {len(FAILURES)} failing check(s): {', '.join(FAILURES)}")
    print(f"selftest: {len(TESTS)} cases green")


if __name__ == "__main__":
    main()
