// The listening page. Figures stay hidden until a take has a verdict: a number seen first anchors the
// ear (registry: brief-conformance-listen), and the question here is what the ear hears.
const AXES = [["instruments", "Instruments"], ["genre", "Genre"], ["pacing", "Pacing"]];
const OVERALL = [["far", "Far"], ["partway", "Partway"], ["close", "Close"]];
const LOUDNESS_TARGET = -16; // quieter than anything here, so every side can be turned down to it

const $ = (selector, root = document) => root.querySelector(selector);
const el = (tag, props = {}, ...kids) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids.filter((k) => k !== null && k !== undefined));
  return node;
};

let state = null;
let tab = "yue2";
let current = null; // the take on side B
let side = "a";
const a = $("#a");
const b = $("#b");

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const allTakes = () => [...state.yue2, ...state.suno].flatMap((p) => p.takes);
const levelFor = (lufs) => (lufs == null ? 0.5 : Math.min(1, 10 ** ((LOUDNESS_TARGET - lufs) / 20)));

function applyLevels() {
  a.volume = side === "a" ? levelFor(state.source.lufs) : 0;
  b.volume = side === "b" ? levelFor(current?.figures?.lufs) : 0;
}

function setSide(next) {
  if (next === "b" && !current) return;
  side = next;
  $("#sideA").setAttribute("aria-pressed", String(side === "a"));
  $("#sideB").setAttribute("aria-pressed", String(side === "b"));
  applyLevels();
}

function togglePlay() {
  if (a.paused) {
    if (current && Math.abs(a.currentTime - b.currentTime) > 0.05) b.currentTime = a.currentTime;
    a.play();
    if (current) b.play();
  } else {
    a.pause();
    b.pause();
  }
}

function seek(t) {
  const end = Math.max(a.duration || 0, b.duration || 0) || state.source.duration_s;
  const to = Math.max(0, Math.min(t, end));
  a.currentTime = to;
  if (current) b.currentTime = to;
  drawCurve();
}

function selectTake(take) {
  current = take;
  const at = a.currentTime;
  const was = !a.paused;
  b.src = take.url;
  b.addEventListener("loadedmetadata", () => {
    b.currentTime = at;
    if (was) b.play();
  }, { once: true });
  $("#sideB").disabled = false;
  $("#now").textContent = `${take.prompt} · ${take.label}`;
  setSide("b");
  drawCurve();
  document.querySelectorAll(".take").forEach((n) => n.classList.toggle("playing", n.dataset.id === take.id));
}

function curvePath(values, seconds, total) {
  const y = (db) => 60 - ((Math.max(-40, Math.min(-4, db)) + 40) / 36) * 56;
  return values.map((db, i) => `${i ? "L" : "M"}${(((i * 2) / total) * 1000).toFixed(1)} ${y(db).toFixed(1)}`).join(" ");
}

function drawCurve() {
  const svg = $("#curve");
  const total = Math.max(state.source.duration_s, current?.figures?.duration_s ?? 0);
  const take = current?.figures?.energy_curve_2s_db;
  const at = (a.currentTime / total) * 1000;
  svg.innerHTML =
    `<path d="${curvePath(state.source.energy, 0, total)}" fill="none" stroke="#e7b45c" stroke-width="2" vector-effect="non-scaling-stroke"/>` +
    (take ? `<path d="${curvePath(take, 0, total)}" fill="none" stroke="#63c7c1" stroke-width="2" vector-effect="non-scaling-stroke"/>` : "") +
    `<line x1="${at}" x2="${at}" y1="0" y2="64" stroke="#e9edf1" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
}

function copyButton(text, name) {
  const button = el("button", { textContent: "Copy", ariaLabel: `Copy ${name}` });
  button.onclick = async () => {
    await navigator.clipboard.writeText(text);
    button.textContent = "Copied";
    setTimeout(() => (button.textContent = "Copy"), 1200);
  };
  return button;
}

function field(name, text) {
  return el("div", { className: "field" },
    el("div", { className: "fieldhead" }, el("span", { textContent: `${name} · ${text.length}` }), copyButton(text, name)),
    el("pre", { textContent: text }));
}

async function saveVerdict(take, patch) {
  const verdict = { ...(state.verdicts[take.id] ?? {}), ...patch };
  state.verdicts[take.id] = verdict;
  await fetch("/api/verdict", { method: "POST", body: JSON.stringify({ takeId: take.id, verdict }) });
}

function figuresRow(take) {
  const f = take.figures;
  if (!f) return null;
  const item = (label, value) => el("span", {}, `${label} `, el("b", { textContent: value ?? "–" }));
  return el("div", { className: "figures" },
    item("closeness", f.closeness),
    item("length", `${f.duration_s} s`),
    item("BPM", f.bpm),
    item("key", f.key),
    item("band in", f.entry_s == null ? null : `${f.entry_s} s`),
    item("energy r", f.energy_corr),
    item("chords", `${Math.round(f.chord_hits * 100)}%`),
    item("timbre gap", f.timbre_gap),
    item("sub", f.bands ? `${Math.round(f.bands.sub * 100)}%` : null),
    item("LUFS", f.lufs));
}

function takeRow(take) {
  const verdict = state.verdicts[take.id] ?? {};
  const row = el("div", { className: "take" });
  row.dataset.id = take.id;
  if (current?.id === take.id) row.classList.add("playing");
  const reveal = el("div", {});
  const showFigures = () => {
    reveal.replaceChildren();
    const rated = AXES.every(([k]) => (state.verdicts[take.id] ?? {})[k]) && (state.verdicts[take.id] ?? {}).overall;
    if (rated) { const figures = figuresRow(take); if (figures) reveal.append(figures); }
  };
  const axis = ([key, label]) => el("div", { className: "axis", role: "group", ariaLabel: label },
    el("span", { textContent: label }),
    ...[1, 2, 3, 4, 5].map((n) => {
      const button = el("button", { textContent: String(n), ariaLabel: `${label} ${n} of 5` });
      button.setAttribute("aria-pressed", String(verdict[key] === n));
      button.onclick = async () => {
        button.parentElement.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", "false"));
        button.setAttribute("aria-pressed", "true");
        await saveVerdict(take, { [key]: n });
        showFigures();
      };
      return button;
    }));
  const overall = el("div", { className: "axis overall", role: "group", ariaLabel: "Overall" },
    el("span", { textContent: "Overall" }),
    ...OVERALL.map(([value, label]) => {
      const button = el("button", { textContent: label });
      button.style.width = "auto";
      button.style.padding = "3px 10px";
      button.dataset.v = value;
      button.setAttribute("aria-pressed", String(verdict.overall === value));
      button.onclick = async () => {
        button.parentElement.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", "false"));
        button.setAttribute("aria-pressed", "true");
        await saveVerdict(take, { overall: value });
        showFigures();
      };
      return button;
    }));
  const note = el("textarea", { placeholder: "Note", value: verdict.note ?? "", ariaLabel: `Note on ${take.id}` });
  note.onchange = () => saveVerdict(take, { note: note.value });
  const listen = el("button", { textContent: current?.id === take.id ? "Selected" : "Listen" });
  listen.onclick = () => {
    selectTake(take);
    document.querySelectorAll(".take button.listen").forEach((n) => (n.textContent = "Listen"));
    listen.textContent = "Selected";
  };
  listen.classList.add("listen");
  row.append(
    el("div", {}, el("div", { className: "takename", textContent: take.label }), listen),
    el("div", {}, el("div", { className: "sheet" }, ...AXES.map(axis), overall), note, reveal));
  showFigures();
  return row;
}

function dropZone(prompt) {
  const input = el("input", { type: "file", accept: ".mp3,.m4a,.wav,.flac,audio/*", multiple: true, ariaLabel: `Add Suno takes for ${prompt.id}` });
  const label = el("label", { className: "drop" }, "Drop Suno takes", input);
  const upload = async (files) => {
    label.firstChild.textContent = `Measuring ${files.length}…`;
    const errors = [];
    for (const file of files) {
      const res = await fetch(`/api/suno/${prompt.id}?name=${encodeURIComponent(file.name)}`, { method: "POST", body: file });
      const answer = await res.json();
      if (!res.ok) errors.push(`${file.name}: ${answer.error}`);
      else if (!answer.measured) errors.push(`${file.name}: saved, not measured: ${answer.error}`);
    }
    await reload();
    if (errors.length) alert(errors.join("\n"));
  };
  input.onchange = () => input.files.length && upload([...input.files]);
  label.ondragover = (e) => { e.preventDefault(); label.classList.add("over"); };
  label.ondragleave = () => label.classList.remove("over");
  label.ondrop = (e) => { e.preventDefault(); label.classList.remove("over"); upload([...e.dataTransfer.files]); };
  return label;
}

function promptCard(prompt, tool) {
  const fields = tool === "suno"
    ? [field("Style", prompt.style), field("Lyrics", prompt.lyrics), field("Exclude", prompt.exclude)]
    : [el("details", {}, el("summary", { textContent: `Style, lyrics, score ${prompt.score ?? ""}${prompt.temperature ? ` · temperature ${prompt.temperature}` : ""}${prompt.music_extra?.cfg_scale ? ` · cfg ${prompt.music_extra.cfg_scale}` : ""}` }),
        field("Style", prompt.style), field("Lyrics", prompt.lyrics))];
  const lead = prompt.takes.slice(0, 1).map(takeRow);
  const rest = prompt.takes.slice(1);
  return el("article", { className: "card" },
    el("div", { className: "cardhead" },
      el("span", { className: "pid", textContent: prompt.id }),
      el("span", { className: "hyp", textContent: prompt.hypothesis }),
      prompt.settings ? el("span", { className: "settings", textContent: prompt.settings }) : null),
    ...fields,
    ...lead,
    rest.length ? el("details", {}, el("summary", { textContent: `${rest.length} more seed${rest.length > 1 ? "s" : ""}` }), ...rest.map(takeRow)) : null,
    tool === "suno" ? dropZone(prompt) : null);
}

function passes(v) {
  return v && AXES.every(([k]) => v[k] >= 4) && v.overall === "close";
}

function sumScore(v) {
  return AXES.reduce((sum, [k]) => sum + (v[k] ?? 0), 0);
}

function board() {
  const rows = allTakes().map((t) => ({ take: t, v: state.verdicts[t.id] })).filter((r) => r.v?.overall);
  const gate = (tool, name) => {
    const own = rows.filter((r) => r.take.tool === tool).sort((x, y) => sumScore(y.v) - sumScore(x.v));
    const total = allTakes().filter((t) => t.tool === tool).length;
    const top = own[0];
    return el("div", { className: "card" },
      el("h3", { textContent: name }),
      el("div", { className: "big" + (own.some((r) => passes(r.v)) ? " pass" : ""), textContent: own.filter((r) => passes(r.v)).length + " close" }),
      el("div", { className: "settings", textContent: `${own.length} of ${total} judged${top ? ` · best ${top.take.id}` : ""}` }));
  };
  const table = el("table", {},
    el("thead", {}, el("tr", {}, ...["Take", "Tool", ...AXES.map(([, l]) => l), "Overall", "Closeness", "Note"].map((t) => el("th", { textContent: t })))),
    el("tbody", {}, ...rows.sort((x, y) => sumScore(y.v) - sumScore(x.v)).map(({ take, v }) => {
      const open = el("button", { textContent: take.id });
      open.onclick = () => selectTake(take);
      return el("tr", {},
        el("td", {}, open), el("td", { textContent: take.tool }),
        ...AXES.map(([k]) => el("td", { className: "num", textContent: v[k] ?? "–" })),
        el("td", { className: passes(v) ? "pass" : "", textContent: v.overall }),
        el("td", { className: "num", textContent: take.figures?.closeness ?? "–" }),
        el("td", { textContent: v.note ?? "" }));
    })));
  return el("div", {},
    el("div", { className: "toolgate" }, gate("yue2", "YuE2 (cover route)"), gate("suno", "Suno v6 (text only)")),
    rows.length ? table : el("div", { className: "empty", textContent: "No verdicts yet" }));
}

function render() {
  const main = $("#main");
  if (tab === "board") return main.replaceChildren(board());
  const prompts = state[tab];
  const open = new Set([...main.querySelectorAll("details[open]")].map((d) => d.closest("article")?.querySelector(".pid")?.textContent));
  main.replaceChildren(...prompts.map((p) => promptCard(p, tab)));
  main.querySelectorAll("article").forEach((card) => {
    if (open.has(card.querySelector(".pid").textContent)) card.querySelectorAll("details").forEach((d) => (d.open = true));
  });
}

async function reload() {
  state = await (await fetch("/api/state")).json();
  const s = state.source;
  $("#facts").textContent = `${s.duration_s} s · ${Math.round(s.bpm)} BPM · ${s.key} · band in ${s.entry_s} s · sub ${Math.round(s.bands.sub * 100)}% · ${s.lufs} LUFS`;
  if (!a.src) a.src = s.url;
  applyLevels();
  drawCurve();
  render();
}

$("#sideA").onclick = () => setSide("a");
$("#sideB").onclick = () => setSide("b");
$("#play").onclick = togglePlay;
a.onplay = () => ($("#play").textContent = "Pause");
a.onpause = () => ($("#play").textContent = "Play");
a.ontimeupdate = () => {
  $("#time").textContent = clock(a.currentTime);
  drawCurve();
  if (current && !b.paused && Math.abs(a.currentTime - b.currentTime) > 0.12) b.currentTime = a.currentTime;
};
$("#curve").onclick = (e) => {
  const box = e.currentTarget.getBoundingClientRect();
  const total = Math.max(state.source.duration_s, current?.figures?.duration_s ?? 0);
  seek(((e.clientX - box.left) / box.width) * total);
};
document.querySelectorAll("nav button").forEach((button) => {
  button.onclick = () => {
    tab = button.dataset.tab;
    document.querySelectorAll("nav button").forEach((n) => n.setAttribute("aria-pressed", String(n === button)));
    render();
  };
});
document.addEventListener("keydown", (e) => {
  if (e.target.matches("textarea, input")) return;
  if (e.code === "Space") { e.preventDefault(); togglePlay(); }
  if (e.key === "s" || e.key === "S") setSide(side === "a" ? "b" : "a");
  if (e.key === "ArrowLeft") seek(a.currentTime - 5);
  if (e.key === "ArrowRight") seek(a.currentTime + 5);
});
reload();
