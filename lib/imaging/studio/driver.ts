// THE LEONARDO STUDIO DRIVER — server-only. One still from the operator's
// signed-in web studio, paid from the STUDIO credit pool (the API key's pool
// answered 402 in 2026-10 and is a separate meter).
//
// HOW A GENERATION IS DRIVEN — the lib/suno/driver.ts shape. The form is filled
// through the DOM (selectors.ts), and the generation is identified from the
// NETWORK: the page's own `Generate` answer carries `generationId` and its cost
// in credits, so nothing is inferred from which card happens to be first. The
// image is then recognised by its CDN path, which carries that id, in whatever
// the page fetches next or draws into an <img>.
//
// WHY THE UI AND NOT THE PAGE'S GRAPHQL DIRECTLY. Issuing `Generate` from inside
// the tab with the page's own session would be smaller and steadier than
// clicking, and it is the better design. It needs the operation's exact query
// text and variables, and on 2026-10-12 those could not be read without
// spending: the profile was not running, and the bundle sits behind a Vercel
// checkpoint a plain fetch cannot pass. Guessing a mutation's shape against the
// operator's credit pool is the one experiment this file refuses to run. Once a
// recon (studioRecon below, read-only) has captured a real `Generate` request,
// replacing the click with a page.evaluate fetch is a local change to
// `generateViaUi`.
//
// THE GUARD ON THE WIRE (registry technique studio-pool-fallback). Every
// GraphQL request the tab sends passes `page.route`: a destructive operation is
// aborted always (this driver deletes NOTHING and leaves the generation in the
// studio), and `Generate` is let through exactly once, and only after the
// driver armed it. During recon every mutation is aborted, so a stray click
// cannot spend.
//
// Errors are StudioError with a sentence that names the work, shown verbatim.

import type { Page, Request, Response, Route } from "playwright";
import { fetchImageBase64 } from "../http";
import type { Aspect, ImageRef } from "../types";
import { attach, isSignedIn, profileContext, studioEndpoint } from "./browser";
import { STUDIO } from "./selectors";
import { StudioError, type StudioHealth, type StudioRun } from "./types";

const PROBE_TTL_MS = 15_000;
const POLL_MS = 1_000;

// ── what the page says, read defensively ─────────────────────────────────────

interface GqlOp {
  name: string;
  mutation: boolean;
  variables: unknown;
}

/** A GraphQL request body is one operation or a batch of them. */
function opsOf(req: Request): GqlOp[] {
  let body: unknown;
  try {
    body = req.postDataJSON();
  } catch {
    return [];
  }
  const list = Array.isArray(body) ? body : [body];
  return list.flatMap((b) => {
    if (!b || typeof b !== "object") return [];
    const o = b as { operationName?: unknown; query?: unknown; variables?: unknown };
    const q = typeof o.query === "string" ? o.query : "";
    const head = /^\s*(query|mutation|subscription)\s*(\w+)?/.exec(q);
    const name = typeof o.operationName === "string" ? o.operationName : (head?.[2] ?? "");
    return [{ name, mutation: head?.[1] === "mutation", variables: o.variables }];
  });
}

/** Every value in a JSON tree, with the key it sat under. */
function walk(v: unknown, visit: (key: string, value: unknown, parent: Record<string, unknown>) => void, depth = 0): void {
  if (depth > 40 || !v || typeof v !== "object") return;
  if (Array.isArray(v)) {
    for (const x of v) walk(x, visit, depth + 1);
    return;
  }
  const o = v as Record<string, unknown>;
  for (const [k, x] of Object.entries(o)) {
    visit(k, x, o);
    walk(x, visit, depth + 1);
  }
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};

/** `Generate`'s receipt: {generationId, cost:{amount, unit}} (2026-10-11 run). */
function receiptOf(body: unknown): { id?: string; credits?: number } {
  let id: string | undefined;
  let credits: number | undefined;
  walk(body, (k, v) => {
    if (k === "generationId" && typeof v === "string" && !id) id = v;
    if (k === "cost" && v && typeof v === "object") {
      const c = v as { amount?: unknown; unit?: unknown };
      const unit = String(c.unit ?? "CREDITS").toUpperCase();
      // Credits only. A unit this driver does not know is not read as credits:
      // the same refusal providers/leonardo.ts makes for its own cost field.
      if (unit === "CREDITS" || unit === "CREDIT" || unit === "TOKENS") credits ??= num(c.amount);
    }
    // The REST API's legacy spelling, in case the studio still sends it.
    if (k === "apiCreditCost" && credits === undefined) credits = num(v);
  });
  return { id, credits: credits !== undefined && credits > 0 ? credits : undefined };
}

/** GetTokens: the pool is the sum of the balance keys present. */
function balanceOf(body: unknown): number | undefined {
  let sum: number | undefined;
  walk(body, (k, v) => {
    if ((STUDIO.api.balanceKeys as readonly string[]).includes(k)) {
      const n = num(v);
      if (n !== undefined) sum = (sum ?? 0) + n;
    }
  });
  return sum;
}

/** A GraphQL error body: {errors:[{message}]}. One line out of it, or null. */
function errorOf(body: unknown): string | null {
  const list = Array.isArray(body) ? body : [body];
  for (const b of list) {
    const errs = (b as { errors?: { message?: unknown }[] } | null)?.errors;
    const m = Array.isArray(errs) ? errs.find((e) => typeof e?.message === "string")?.message : undefined;
    if (typeof m === "string" && m.trim()) return m.trim().split("\n")[0];
  }
  return null;
}

const looksLikeCredits = (s: string) => /insufficient|not enough|credit|token balance|quota|upgrade/i.test(s);

// ── health ───────────────────────────────────────────────────────────────────

/** What the last generation's page reported, kept for the next health read: a
 *  pool that answered "0 left" is out of credits without opening a tab. */
const lastSeen: { balance?: number; credits?: number } = {};
const probeCache = new Map<string, { at: number; health: StudioHealth }>();

/** Health on an explicit endpoint — the test seam (a closed port shows "not
 *  running" without touching the operator's Chrome). Never launches. */
export async function studioHealthOn(endpoint: string): Promise<StudioHealth> {
  const hit = probeCache.get(endpoint);
  if (hit && Date.now() - hit.at < PROBE_TTL_MS) return hit.health;
  let health: StudioHealth;
  try {
    const browser = await attach({ endpoint, spawn: false });
    if (!(await isSignedIn(profileContext(browser)))) health = { ok: false, reason: "not signed in to leonardo" };
    else if (lastSeen.balance !== undefined && lastSeen.balance < (lastSeen.credits ?? 1))
      health = { ok: false, reason: `leonardo studio is out of credits (${lastSeen.balance} left)` };
    else health = { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    health = {
      ok: false,
      reason: /not running/.test(msg) ? "leonardo studio browser not running" : `leonardo studio browser unreachable: ${msg.split("\n")[0]}`,
    };
  }
  probeCache.set(endpoint, { at: Date.now(), health });
  return health;
}

export const studioHealth = (): Promise<StudioHealth> => studioHealthOn(studioEndpoint());

// ── the guard ────────────────────────────────────────────────────────────────

interface Guard {
  /** Let exactly one `Generate` through, from now on. */
  arm(): void;
  /** Operations the guard aborted, by name — the receipt that it held. */
  blocked: string[];
}

async function installGuard(page: Page, mode: "recon" | "generate"): Promise<Guard> {
  let armed = false;
  let generated = false;
  const blocked: string[] = [];
  await page.route(`${STUDIO.api.graphql}**`, async (route: Route) => {
    const ops = opsOf(route.request());
    const refuse = ops.find(
      (op) =>
        STUDIO.api.destructiveOp.test(op.name) ||
        (mode === "recon" && (op.mutation || STUDIO.api.generateOp.test(op.name))) ||
        (STUDIO.api.generateOp.test(op.name) && (!armed || generated)),
    );
    if (refuse) {
      blocked.push(refuse.name || "(unnamed mutation)");
      await route.abort("blockedbyclient").catch(() => {});
      return;
    }
    if (ops.some((op) => STUDIO.api.generateOp.test(op.name))) generated = true;
    await route.continue().catch(() => {});
  });
  return {
    arm: () => {
      armed = true;
    },
    blocked,
  };
}

// ── generate ─────────────────────────────────────────────────────────────────

async function clickIfPresent(page: Page, selector: string): Promise<boolean> {
  const loc = page.locator(selector).filter({ visible: true }).first();
  if (!(await loc.count())) return false;
  try {
    await loc.click({ timeout: 5_000 });
  } catch {
    await loc.evaluate((el) => (el as HTMLElement).click());
  }
  return true;
}

/** One still. Resolves once the image bytes are held; the generation stays in
 *  the operator's studio (WP1 deletes nothing). */
export async function studioGenerate(prompt: string, aspect: Aspect): Promise<StudioRun> {
  let browser;
  try {
    browser = await attach({ spawn: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new StudioError(/not running/.test(msg) ? "leonardo studio browser not running" : `leonardo studio browser unreachable: ${msg.split("\n")[0]}`, "unreachable");
  }
  const ctx = profileContext(browser);
  if (!(await isSignedIn(ctx))) throw new StudioError("not signed in to leonardo", "signed-out");

  const page = await ctx.newPage();
  const guard = await installGuard(page, "generate");
  let armedAt = 0;
  let gen: { id?: string; credits?: number; status: number; error: string | null } | null = null;
  let balance: number | undefined;
  const urls = new Set<string>();
  const statuses = new Map<string, string>();

  const onResponse = async (r: Response) => {
    if (!r.url().startsWith(STUDIO.api.graphql)) return;
    const ops = opsOf(r.request());
    let body: unknown = null;
    try {
      body = await r.json();
    } catch {
      /* an unreadable answer still counts for `Generate` below */
    }
    if (ops.some((op) => STUDIO.api.tokensOp.test(op.name))) balance = balanceOf(body) ?? balance;
    const isGenerate =
      armedAt > 0 && (ops.some((op) => STUDIO.api.generateOp.test(op.name)) || (ops.some((op) => op.mutation) && !!receiptOf(body).id));
    if (isGenerate && !gen) gen = { ...receiptOf(body), status: r.status(), error: errorOf(body) };
    walk(body, (k, v, parent) => {
      if (typeof v === "string" && v.startsWith("https://cdn.leonardo.ai/")) urls.add(v);
      if (k === "status" && typeof v === "string" && typeof parent.id === "string") statuses.set(parent.id, v);
    });
  };
  page.on("response", onResponse);

  try {
    await page.goto(STUDIO.page.generateUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    if (STUDIO.page.signedOutPath.test(new URL(page.url()).pathname)) throw new StudioError("not signed in to leonardo", "signed-out");

    const box = page.locator(STUDIO.form.prompt).filter({ visible: true }).first();
    await box.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {
      throw new StudioError("leonardo studio prompt box not found", "failed");
    });

    // The model: Auto resolved to Lucid Origin on 2026-10-11. A different
    // model is not quietly accepted — it bills differently and draws differently.
    const model = page.locator(STUDIO.form.modelTrigger).filter({ visible: true }).first();
    if (!(await model.count()) || !STUDIO.form.modelOk.test(await model.innerText()))
      throw new StudioError("leonardo studio model is not Auto (Lucid Origin)", "failed");
    if (!(await clickIfPresent(page, STUDIO.form.aspect(aspect))))
      throw new StudioError(`leonardo studio has no ${aspect} aspect control`, "failed");
    if (!(await clickIfPresent(page, STUDIO.form.countOne)))
      throw new StudioError("leonardo studio image-count control not found", "failed");
    await box.fill(prompt);

    if (balance !== undefined && balance <= 0) throw new StudioError("leonardo studio is out of credits", "no-credits");

    // The price before the click: the button carries it. Unreadable is not a
    // refusal (the label may change), but a price above the ceiling is.
    const button = page.locator(STUDIO.form.generate).filter({ visible: true }).first();
    if (!(await button.count())) throw new StudioError("leonardo studio generate button not found", "failed");
    const price = Math.max(0, ...((await button.innerText()).match(/\d+/g) ?? []).map(Number));
    if (price > STUDIO.limits.maxCreditsPerImage)
      throw new StudioError(`leonardo studio priced this at ${price} credits; the ceiling is ${STUDIO.limits.maxCreditsPerImage}`, "failed");
    if (await button.isDisabled()) throw new StudioError("leonardo studio generate button stayed disabled", "failed");

    guard.arm();
    armedAt = Date.now();
    await button.click({ timeout: 5_000 });

    while (!gen && Date.now() - armedAt < STUDIO.limits.generateAnswerMs) await page.waitForTimeout(250);
    const g = gen as { id?: string; credits?: number; status: number; error: string | null } | null;
    if (!g) throw new StudioError("leonardo studio did not answer the generate", "failed", true);
    if (g.status === 402 || (g.error && looksLikeCredits(g.error))) throw new StudioError("leonardo studio is out of credits", "no-credits", true);
    if (g.status >= 400 || g.error || !g.id)
      throw new StudioError(`leonardo studio refused the generate: ${g.error ?? `HTTP ${g.status}`}`, "failed", true);
    const id = g.id;

    const want = STUDIO.cdn.imageOf(id);
    const deadline = Date.now() + STUDIO.limits.renderTimeoutMs;
    let url: string | undefined;
    for (;;) {
      url = [...urls].find((u) => want.test(u));
      if (!url) {
        const srcs = await page.$$eval("img", (imgs) => imgs.map((i) => (i as HTMLImageElement).src)).catch(() => [] as string[]);
        url = srcs.find((u) => want.test(u));
      }
      if (url) break;
      const status = statuses.get(id) ?? "";
      if (STUDIO.api.refusedStatus.test(status)) throw new StudioError("leonardo declined this prompt on safety grounds", "refused", true);
      if (STUDIO.api.failedStatus.test(status)) throw new StudioError(`leonardo studio failed generation ${id}`, "failed", true);
      if (Date.now() > deadline)
        throw new StudioError(`leonardo studio did not finish in ${STUDIO.limits.renderTimeoutMs / 60_000} min (generation ${id})`, "timeout", true);
      await page.waitForTimeout(POLL_MS);
    }

    let image: ImageRef;
    try {
      const { base64, mime } = await fetchImageBase64("leonardo-studio", url);
      image = { base64, mime: mime as ImageRef["mime"], ...dimensionsOf(Buffer.from(base64, "base64")) };
    } catch (e) {
      throw new StudioError(`leonardo studio image download failed: ${e instanceof Error ? e.message : String(e)}`, "failed", true);
    }

    lastSeen.credits = g.credits ?? lastSeen.credits;
    // The page refreshes its balance after a spend; read whatever arrived last.
    lastSeen.balance = balance;
    return { generationId: id, image, credits: g.credits, balance, model: "lucid-origin" };
  } finally {
    page.off("response", onResponse);
    await page.unroute(`${STUDIO.api.graphql}**`).catch(() => {});
    await page.close().catch(() => {});
  }
}

/** The DELIVERED size, read from the file rather than from the control's
 *  label (the 2026-10-11 run's clip said 768 and delivered 512). PNG and
 *  baseline/progressive JPEG; anything else leaves the size unstated. */
export function dimensionsOf(b: Buffer): { width?: number; height?: number } {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return {};
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
        return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return {};
}

// ── recon (read-only) ────────────────────────────────────────────────────────

export interface StudioRecon {
  url: string;
  signedIn: boolean;
  /** Cookie NAMES on app.leonardo.ai — never values. */
  cookies: string[];
  /** Each form selector in selectors.ts, and how many visible elements it matched. */
  selectors: Record<string, number>;
  generateLabel: string | null;
  balance?: number;
  /** Every GraphQL operation the page sent while loading, by name. */
  operations: string[];
  /** Operations the guard aborted — any here means the page tried a mutation. */
  blocked: string[];
}

/**
 * Open the studio in a new tab, resolve every selector, list the page's own
 * GraphQL traffic, close the tab. Spends nothing: every mutation is aborted on
 * the wire and nothing is clicked or typed. This is the step that turns the
 * UNVERIFIED rows of selectors.ts into dated ones, and that captures the
 * operation names a direct-GraphQL path would need.
 */
export async function studioRecon(endpoint = studioEndpoint()): Promise<StudioRecon> {
  const browser = await attach({ endpoint, spawn: false });
  const ctx = profileContext(browser);
  const page = await ctx.newPage();
  const guard = await installGuard(page, "recon");
  const operations: string[] = [];
  let balance: number | undefined;
  const onRequest = (r: Request) => {
    if (r.url().startsWith(STUDIO.api.graphql)) for (const op of opsOf(r)) operations.push(`${op.mutation ? "mutation" : "query"} ${op.name}`);
  };
  const onResponse = async (r: Response) => {
    if (!r.url().startsWith(STUDIO.api.graphql) || !opsOf(r.request()).some((op) => STUDIO.api.tokensOp.test(op.name))) return;
    balance = balanceOf(await r.json().catch(() => null)) ?? balance;
  };
  page.on("request", onRequest);
  page.on("response", onResponse);
  try {
    await page.goto(STUDIO.page.generateUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(8_000);
    const count = (sel: string) => page.locator(sel).filter({ visible: true }).count().catch(() => -1);
    const button = page.locator(STUDIO.form.generate).filter({ visible: true }).first();
    return {
      url: page.url(),
      signedIn: await isSignedIn(ctx),
      cookies: (await ctx.cookies(STUDIO.auth.cookieUrl)).map((c) => c.name),
      selectors: {
        prompt: await count(STUDIO.form.prompt),
        modelTrigger: await count(STUDIO.form.modelTrigger),
        aspect169: await count(STUDIO.form.aspect("16:9")),
        countOne: await count(STUDIO.form.countOne),
        generate: await count(STUDIO.form.generate),
      },
      generateLabel: (await button.count()) ? await button.innerText() : null,
      balance,
      operations: [...new Set(operations)],
      blocked: guard.blocked,
    };
  } finally {
    page.off("request", onRequest);
    page.off("response", onResponse);
    await page.unroute(`${STUDIO.api.graphql}**`).catch(() => {});
    await page.close().catch(() => {});
  }
}
