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
let current = null; // the take loaded on the player
let side = "b";
const positions = new Map(); // where each take was left
const a = $("#a");
const b = $("#b");

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const allTakes = () => [...state.yue2, ...state.suno].flatMap((p) => p.takes);
const levelFor = (lufs) => (lufs == null ? 0.5 : Math.min(1, 10 ** ((LOUDNESS_TARGET - lufs) / 20)));

function applyLevels() {
  if (!state) return;
  a.volume = side === "a" ? levelFor(state.source.lufs) : 0;
  b.volume = side === "b" ? levelFor(current?.figures?.lufs) : 0;
}

// The take drives the clock: a Suno take can outrun the source, and then the source side is silence.
function syncSource() {
  const inside = a.duration ? b.currentTime < a.duration : true;
  if (!inside || b.paused) return a.pause();
  if (a.paused) a.play();
}

function load(take, at) {
  if (current) positions.set(current.id, b.currentTime);
  current = take;
  b.src = take.url;
  return new Promise((done) => {
    b.addEventListener("loadedmetadata", () => {
      b.currentTime = at;
      a.currentTime = Math.min(at, a.duration || at);
      applyLevels();
      paint();
      done();
    }, { once: true });
  });
}

async function startOn(take, at) {
  a.pause();
  b.pause();
  side = "b";
  await load(take, at);
  return b.play();
}

function toggle(take) {
  if (current?.id !== take.id) return startOn(take, positions.get(take.id) ?? 0);
  return b.paused ? b.play() : b.pause();
}

function seekTo(take, seconds) {
  if (current?.id !== take.id) return startOn(take, seconds);
  b.currentTime = Math.max(0, seconds);
  a.currentTime = Math.min(b.currentTime, a.duration || b.currentTime);
  syncSource();
  paint();
}

async function setSide(take, next) {
  if (current?.id !== take.id) await load(take, positions.get(take.id) ?? 0);
  side = next;
  applyLevels();
  paint();
}

const totalOf = (take) => Math.max(state.source.duration_s, take.figures?.duration_s ?? 0);

function curvePath(values, total) {
  const y = (db) => 40 - ((Math.max(-40, Math.min(-4, db)) + 40) / 36) * 36;
  return values.map((db, i) => `${i ? "L" : "M"}${(((i * 2) / total) * 1000).toFixed(1)} ${y(db).toFixed(1)}`).join(" ");
}

function curveMarkup(take) {
  const total = totalOf(take);
  const own = take.figures?.energy_curve_2s_db;
  return `<path d="${curvePath(state.source.energy, total)}" fill="none" stroke="#e7b45c" stroke-width="2" vector-effect="non-scaling-stroke"/>` +
    (own ? `<path d="${curvePath(own, total)}" fill="none" stroke="#63c7c1" stroke-width="2" vector-effect="non-scaling-stroke"/>` : "") +
    `<line class="head" x1="0" x2="0" y1="0" y2="44" stroke="#e9edf1" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
}

// Every control for a take, wherever it is drawn, reads from here. Rows are rebuilt on tab changes and
// uploads while the audio keeps playing, so no control may hold its own state.
function paint() {
  document.querySelectorAll("[data-player]").forEach((node) => {
    const id = node.dataset.player;
    const live = current?.id === id;
    const playing = live && !b.paused;
    const at = live ? b.currentTime : positions.get(id) ?? 0;
    const name = node.dataset.name;
    const play = $(".play", node);
    if (play) {
      play.textContent = playing ? "Pause" : "Play";
      play.setAttribute("aria-label", `${playing ? "Pause" : "Play"} ${name}`);
    }
    const own = $(".side-b", node);
    if (own) {
      own.setAttribute("aria-pressed", String(!live || side === "b"));
      $(".side-a", node).setAttribute("aria-pressed", String(live && side === "a"));
    }
    const time = $(".time", node);
    if (time) time.textContent = clock(at);
    const head = $(".head", node);
    if (head) {
      const x = (at / Number(node.dataset.total)) * 1000;
      head.setAttribute("x1", x);
      head.setAttribute("x2", x);
    }
  });
  document.querySelectorAll(".take").forEach((n) => n.classList.toggle("playing", n.dataset.id === current?.id));
}

function player(take) {
  const name = `${take.prompt} ${take.label}`;
  const play = el("button", { className: "play", textContent: "Play" });
  play.onclick = () => toggle(take);
  const source = el("button", { className: "side-a src", textContent: "Source", ariaLabel: `Hear the source during ${name}` });
  source.onclick = () => setSide(take, "a");
  const own = el("button", { className: "side-b", textContent: "Take", ariaLabel: `Hear ${name}` });
  own.onclick = () => setSide(take, "b");
  const curve = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  curve.setAttribute("class", "curve");
  curve.setAttribute("role", "img");
  curve.setAttribute("aria-label", `Energy over time: source and ${name}`);
  curve.setAttribute("viewBox", "0 0 1000 44");
  curve.setAttribute("preserveAspectRatio", "none");
  curve.innerHTML = curveMarkup(take);
  curve.onclick = (e) => {
    const box = curve.getBoundingClientRect();
    seekTo(take, ((e.clientX - box.left) / box.width) * totalOf(take));
  };
  const node = el("div", { className: "player" },
    el("div", { className: "controls" },
      play,
      el("div", { className: "sides", role: "group", ariaLabel: "Which side plays" }, source, own),
      el("span", { className: "time", textContent: "0:00" }),
      el("span", { className: "takename", textContent: take.label })),
    curve);
  node.dataset.player = take.id;
  node.dataset.name = name;
  node.dataset.total = String(totalOf(take));
  return node;
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
  row.append(player(take), el("div", {}, el("div", { className: "sheet" }, ...AXES.map(axis), overall), note, reveal));
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
      const play = el("button", { className: "play", textContent: "Play" });
      play.onclick = () => toggle(take);
      const cell = el("td", { className: "boardplay" }, play, ` ${take.id}`);
      cell.dataset.player = take.id;
      cell.dataset.name = take.id;
      cell.dataset.total = String(totalOf(take));
      return el("tr", {},
        cell, el("td", { textContent: take.tool }),
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
  if (tab === "board") {
    main.replaceChildren(board());
    return paint();
  }
  const prompts = state[tab];
  const open = new Set([...main.querySelectorAll("details[open]")].map((d) => d.closest("article")?.querySelector(".pid")?.textContent));
  main.replaceChildren(...prompts.map((p) => promptCard(p, tab)));
  main.querySelectorAll("article").forEach((card) => {
    if (open.has(card.querySelector(".pid").textContent)) card.querySelectorAll("details").forEach((d) => (d.open = true));
  });
  paint();
}

async function reload() {
  state = await (await fetch("/api/state")).json();
  const s = state.source;
  $("#facts").textContent = `${s.duration_s} s · ${Math.round(s.bpm)} BPM · ${s.key} · band in ${s.entry_s} s · sub ${Math.round(s.bands.sub * 100)}% · ${s.lufs} LUFS`;
  if (!a.src) a.src = s.url;
  applyLevels();
  render();
}

b.onplay = () => { syncSource(); paint(); };
b.onpause = () => { a.pause(); paint(); };
b.onended = () => { a.pause(); paint(); };
b.ontimeupdate = () => {
  syncSource();
  // Only the side nobody is hearing is ever corrected, so a correction cannot be heard as a skip.
  if (!a.paused && Math.abs(a.currentTime - b.currentTime) > 0.12) {
    if (side === "b") a.currentTime = b.currentTime;
    else b.currentTime = a.currentTime;
  }
  paint();
};
document.querySelectorAll("nav button").forEach((button) => {
  button.onclick = () => {
    tab = button.dataset.tab;
    document.querySelectorAll("nav button").forEach((n) => n.setAttribute("aria-pressed", String(n === button)));
    render();
  };
});
// A mouse click leaves focus on the button, where Space would press it again instead of playing.
document.addEventListener("click", (e) => {
  if (e.detail > 0 && e.target.closest("button")) e.target.closest("button").blur();
});
document.addEventListener("keydown", (e) => {
  if (e.target.matches("textarea, input, button, summary") || !current) return;
  if (e.code === "Space") { e.preventDefault(); toggle(current); }
  if (e.key === "s" || e.key === "S") setSide(current, side === "a" ? "b" : "a");
  if (e.key === "ArrowLeft") seekTo(current, b.currentTime - 5);
  if (e.key === "ArrowRight") seekTo(current, b.currentTime + 5);
});
reload();
