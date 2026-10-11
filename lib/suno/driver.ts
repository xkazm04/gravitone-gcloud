// THE SUNO BROWSER DRIVER — server-only. Attaches over CDP to the dedicated
// profile (~/.suno-chrome on SUNO_CDP_PORT); never the operator's default
// profile, which Chrome 136+ refuses to expose to remote debugging.
//
// HOW A CREATE IS DRIVEN. The form is filled through the DOM (selectors.ts),
// but the clips are identified from the NETWORK: the page's own POST to
// /api/generate/v2-web/ answers with the new clip ids, so there is no guessing
// which rows of the library list are new. Rendering is then followed by asking
// /api/clip/<id> from inside the tab with the page's own Clerk token, and by
// passively reading any clip JSON the page fetches for itself.
//
// Errors thrown here are shown to the operator verbatim: short, and naming the
// work ("suno refused the create: …"), never the mechanism.

import type { Page, Request, Response } from "playwright";
import type { SunoClipRef, SunoDriverHealth, SunoFields, SunoModel, SunoPhase } from "./types";
import { SUNO_CDP_PORT, SUNO_MODEL_LABEL } from "./types";
import { attach, isSignedIn, profileContext } from "./browser";
import { normalizeModelLabel, SELECTORS } from "./selectors";

const PROBE_TTL_MS = 15_000;
const RENDER_TIMEOUT_MS = 6 * 60_000;
const POLL_MS = 5_000;

// ── probe ────────────────────────────────────────────────────────────────────

const probeCache = new Map<number, { at: number; health: SunoDriverHealth }>();

/** The probe on an explicit port — the test seam (a closed port such as 9399
 *  shows "not running" without touching the operator's Chrome). Never launches. */
export async function probeSunoOn(port: number): Promise<SunoDriverHealth> {
  const hit = probeCache.get(port);
  if (hit && Date.now() - hit.at < PROBE_TTL_MS) return hit.health;
  let health: SunoDriverHealth;
  try {
    const browser = await attach({ port, spawn: false });
    health = (await isSignedIn(profileContext(browser))) ? { ok: true } : { ok: false, reason: "not signed in to suno" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    health = { ok: false, reason: /not running/.test(msg) ? "suno browser not running" : `suno browser unreachable: ${msg.split("\n")[0]}` };
  }
  probeCache.set(port, { at: Date.now(), health });
  return health;
}

/** Is a signed-in Suno reachable? Cheap; called on every snapshot read. */
export async function probeSuno(): Promise<SunoDriverHealth> {
  return probeSunoOn(SUNO_CDP_PORT);
}

// ── clip JSON → SunoClipRef ──────────────────────────────────────────────────

interface RawClip {
  id?: string;
  status?: string;
  title?: string;
  audio_url?: string;
  image_url?: string;
  image_large_url?: string;
  media_urls?: { url?: string }[];
  metadata?: { duration?: number | null; error_message?: string | null };
}

function audioOf(c: RawClip): string | null {
  const media = c.media_urls?.find((m) => typeof m.url === "string" && m.url)?.url;
  if (media) return media;
  if (c.audio_url && !SELECTORS.api.forbiddenAudio.test(c.audio_url)) return c.audio_url;
  return null;
}

function toRef(id: string, c: RawClip | undefined, fallbackTitle: string): SunoClipRef {
  const d = c?.metadata?.duration;
  return {
    songId: id,
    url: `https://suno.com/song/${id}`,
    audioUrl: c ? audioOf(c) : null,
    imageUrl: c?.image_large_url || c?.image_url || null,
    title: c?.title || fallbackTitle,
    durationS: typeof d === "number" && d > 0 ? d : null,
  };
}

function clipsIn(body: unknown): RawClip[] {
  if (Array.isArray(body)) return body as RawClip[];
  if (body && typeof body === "object") {
    const o = body as { clips?: unknown; id?: unknown };
    if (Array.isArray(o.clips)) return o.clips as RawClip[];
    if (typeof o.id === "string") return [o as RawClip];
  }
  return [];
}

/** Suno's error bodies are {detail: string | {msg}[]} — one line out of it. */
function detailOf(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const d = (body as { detail?: unknown; message?: unknown }).detail ?? (body as { message?: unknown }).message;
    if (typeof d === "string" && d.trim()) return d.trim();
    if (Array.isArray(d) && d.length) {
      const first = d[0] as { msg?: unknown };
      if (typeof first?.msg === "string") return first.msg;
    }
  }
  return fallback;
}

const isInstrumental = (lyrics: string | undefined) => !lyrics || !lyrics.trim() || /^\[\s*instrumental\s*\]$/i.test(lyrics.trim());
const looksLikeCredits = (s: string) => /credit|insufficient|quota|limit reached|upgrade/i.test(s);

// ── the form ─────────────────────────────────────────────────────────────────

const visible = (page: Page, sel: string) => page.locator(sel).filter({ visible: true }).first();

/** Click, and if an overlay (the cookie banner) intercepts the pointer, fall
 *  back to a DOM click — the banner is the operator's to answer, not ours. */
async function press(loc: ReturnType<typeof visible>) {
  try {
    await loc.click({ timeout: 5_000 });
  } catch {
    await loc.evaluate((el) => (el as HTMLElement).click());
  }
}

async function selectModel(page: Page, model: SunoModel) {
  const want = normalizeModelLabel(SUNO_MODEL_LABEL[model]);
  const trigger = page.locator(SELECTORS.model.trigger).filter({ visible: true }).filter({ hasText: SELECTORS.model.triggerText }).first();
  await trigger.waitFor({ state: "visible", timeout: 20_000 }).catch(() => {
    throw new Error("suno model picker not found");
  });
  if (normalizeModelLabel(await trigger.innerText()) === want) return;
  await press(trigger);
  const rows = page.locator(SELECTORS.model.row);
  await rows.first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {
    throw new Error("suno model picker did not open");
  });
  const labels: string[] = [];
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const label = ((await rows.nth(i).innerText()).split("\n")[0] ?? "").trim();
    labels.push(label);
    // A row's first line is the label, sometimes followed by a badge on the same line ("v6-wild Pro").
    const head = normalizeModelLabel(label.split(/\s+(?=pro\b|beta\b|new\b)/i)[0] ?? label);
    if (head === want) {
      await press(rows.nth(i));
      await page.waitForTimeout(400);
      const now = normalizeModelLabel(await trigger.innerText());
      if (now !== want) throw new Error(`suno model picker did not switch to '${SUNO_MODEL_LABEL[model]}'`);
      return;
    }
  }
  await page.keyboard.press("Escape");
  throw new Error(`model picker has no '${SUNO_MODEL_LABEL[model]}' (it lists ${labels.filter(Boolean).join(", ") || "nothing"})`);
}

async function fillForm(page: Page, fields: SunoFields) {
  const advanced = page.locator(SELECTORS.form.advancedTab).filter({ visible: true }).first();
  if ((await advanced.count()) && (await advanced.getAttribute("aria-selected")) !== "true") {
    await press(advanced);
    await page.waitForTimeout(300);
  }

  const lyrics = visible(page, SELECTORS.form.lyrics);
  await lyrics.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {
    throw new Error("suno lyrics field not found");
  });
  await press(lyrics);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Delete");
  if (!isInstrumental(fields.lyrics)) await page.keyboard.insertText(fields.lyrics!.trim());

  const style = visible(page, SELECTORS.form.style);
  if (!(await style.count())) throw new Error("suno style field not found");
  await style.fill(fields.style);

  const exclude = visible(page, SELECTORS.form.exclude);
  if (await exclude.count()) await exclude.fill(fields.exclude ?? "");
  else if (fields.exclude) throw new Error("suno exclude-styles field not found");

  const title = visible(page, SELECTORS.form.title);
  if (await title.count()) await title.fill(fields.title ?? "");
  else if (fields.title) throw new Error("suno title field not found");
}

// ── create ───────────────────────────────────────────────────────────────────

/** Test/smoke seam: called with the create request's body once it is sent. */
export type CreateObserver = { onGenerateRequest?: (body: unknown) => void };

/** One custom create on one model. Resolves with the clips Suno made for it
 *  (normally 2) once each has a song id; `onPhase` is called on every phase
 *  change. Throws an Error whose message is shown to the operator verbatim. */
export async function createSunoTracks(
  fields: SunoFields,
  model: SunoModel,
  onPhase: (phase: SunoPhase) => void,
  observer: CreateObserver = {},
): Promise<SunoClipRef[]> {
  if (!fields.style?.trim()) throw new Error("suno create needs a style");
  onPhase("attaching");
  const browser = await attach({ spawn: true });
  const ctx = profileContext(browser);
  if (!(await isSignedIn(ctx))) throw new Error("not signed in to suno");

  const page = await ctx.newPage();
  // What the page itself learns, kept as it happens.
  const seen = new Map<string, RawClip>();
  let headers: Record<string, string> = {};
  let billing: { credits?: number; monthly_usage?: number; monthly_limit?: number } | null = null;
  let generate: { status: number; body: unknown } | null = null;

  const onRequest = (r: Request) => {
    if (!r.url().startsWith(SELECTORS.api.base)) return;
    const h = r.headers();
    if (h.authorization) {
      headers = { authorization: h.authorization };
      if (h["browser-token"]) headers["browser-token"] = h["browser-token"];
      if (h["device-id"]) headers["device-id"] = h["device-id"];
    }
    if (r.method() === "POST" && SELECTORS.api.generate.test(r.url())) {
      try {
        observer.onGenerateRequest?.(r.postDataJSON());
      } catch {
        /* the observer is a seam, never a failure */
      }
    }
  };
  const onResponse = async (r: Response) => {
    const url = r.url();
    if (!url.startsWith(SELECTORS.api.base)) return;
    const isGenerate = r.request().method() === "POST" && SELECTORS.api.generate.test(url);
    let body: unknown = null;
    try {
      body = await r.json();
    } catch {
      if (!isGenerate) return;
    }
    if (isGenerate) generate = { status: r.status(), body };
    else if (SELECTORS.api.billing.test(url) && body && typeof body === "object") billing = body as typeof billing;
    else for (const c of clipsIn(body)) if (c.id && seen.has(c.id)) seen.set(c.id, { ...seen.get(c.id), ...c });
  };
  page.on("request", onRequest);
  page.on("response", onResponse);

  try {
    await page.goto(SELECTORS.page.createUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    if (page.url().includes(SELECTORS.page.signInPath)) throw new Error("not signed in to suno");
    await visible(page, SELECTORS.form.create).waitFor({ state: "visible", timeout: 30_000 }).catch(() => {
      if (page.url().includes(SELECTORS.page.signInPath)) throw new Error("not signed in to suno");
      throw new Error("suno create form did not load");
    });

    onPhase("composing");
    await selectModel(page, model);
    await fillForm(page, fields);

    const b = billing as { credits?: number; monthly_usage?: number; monthly_limit?: number } | null;
    if (b && typeof b.monthly_limit === "number" && typeof b.monthly_usage === "number") {
      const left = b.monthly_limit - b.monthly_usage + (b.credits ?? 0);
      if (left <= 0) throw new Error("suno: out of credits");
    }

    onPhase("creating");
    const create = visible(page, SELECTORS.form.create);
    try {
      await create.waitFor({ state: "visible", timeout: 5_000 });
      if (await create.isDisabled()) await page.waitForTimeout(1_000);
      if (await create.isDisabled()) throw new Error("suno create button stayed disabled");
    } catch (e) {
      throw e instanceof Error && e.message.startsWith("suno") ? e : new Error("suno create button not found");
    }
    await press(create);

    const sentAt = Date.now();
    while (!generate && Date.now() - sentAt < 60_000) await page.waitForTimeout(250);
    const gen = generate as { status: number; body: unknown } | null;
    if (!gen) {
      const text = await page.locator("body").innerText().catch(() => "");
      if (looksLikeCredits(text) && /out of credits|not enough credits|insufficient credits/i.test(text)) throw new Error("suno: out of credits");
      throw new Error("suno did not answer the create");
    }
    if (gen.status >= 400) {
      const detail = detailOf(gen.body, `HTTP ${gen.status}`);
      if (gen.status === 402 || looksLikeCredits(detail)) throw new Error("suno: out of credits");
      throw new Error(`suno refused the create: ${detail}`);
    }
    const ids = clipsIn(gen.body).map((c) => c.id).filter((id): id is string => typeof id === "string");
    if (!ids.length) throw new Error(`suno refused the create: ${detailOf(gen.body, "no clips in the answer")}`);
    for (const c of clipsIn(gen.body)) if (c.id) seen.set(c.id, c);

    onPhase("rendering");
    const fallbackTitle = fields.title?.trim() || "Untitled";
    const deadline = Date.now() + RENDER_TIMEOUT_MS;
    for (;;) {
      for (const id of ids) {
        const fresh = await fetchClip(page, id, headers);
        if (fresh) seen.set(id, { ...seen.get(id), ...fresh });
      }
      const clips = ids.map((id) => seen.get(id));
      const failed = clips.find((c) => c?.status === "error");
      if (failed) throw new Error(`suno failed the clip: ${failed.metadata?.error_message || "no reason given"}`);
      if (clips.every((c) => c?.status === "complete")) break;
      if (Date.now() > deadline) {
        // The ids are real and the credits are spent: hand back what exists
        // (audioUrl null where Suno has not exposed it) rather than lose them.
        if (clips.every((c) => c && audioOf(c))) break;
        throw new Error(`suno did not finish rendering in ${RENDER_TIMEOUT_MS / 60_000} min (songs ${ids.join(", ")})`);
      }
      await page.waitForTimeout(POLL_MS);
    }

    onPhase("collecting");
    return ids.map((id) => toRef(id, seen.get(id), fallbackTitle));
  } finally {
    page.off("request", onRequest);
    page.off("response", onResponse);
    await page.close().catch(() => {});
  }
}

/** GET /api/clip/<id> from inside the tab, with a fresh Clerk token when the
 *  page exposes one and the last captured headers otherwise. Null on any miss:
 *  the passive listener may still have it. */
async function fetchClip(page: Page, id: string, headers: Record<string, string>): Promise<RawClip | null> {
  try {
    return await page.evaluate(
      async ({ url, headers }) => {
        const clerk = (window as unknown as { Clerk?: { session?: { getToken?: () => Promise<string | null> } } }).Clerk;
        const token = await clerk?.session?.getToken?.().catch(() => null);
        const h: Record<string, string> = { ...headers };
        if (token) h.authorization = `Bearer ${token}`;
        if (!h.authorization) return null;
        const r = await fetch(url, { headers: h });
        return r.ok ? ((await r.json()) as unknown) : null;
      },
      { url: SELECTORS.api.base + SELECTORS.api.clip(id), headers },
    ) as RawClip | null;
  } catch {
    return null;
  }
}
