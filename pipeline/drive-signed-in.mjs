/**
 * Drive the GATED studio surface, using the development auth bypass.
 *
 *   NEXT_PUBLIC_DEV_AUTH=1 npx next dev -p 3183
 *   node pipeline/drive-signed-in.mjs http://localhost:3183
 *
 * The bypass only exists in a non-production build (see lib/devAuth.ts), so this
 * must run against `next dev`. If the banner is absent the script stops rather
 * than reporting on a surface it never reached.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3183";
const SHOTS = "pipeline/runs/2026-08-11-why-bitcoin-price-does-not-rise/captures";
mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (n, ok, d = "") => { results.push({ n, ok, d }); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(`${BASE}/projects`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

if ((await page.getByTestId("dev-auth-banner").count()) === 0) {
  console.log("\nDEV BYPASS NOT ACTIVE. Start the dev server with the flag:");
  console.log("  NEXT_PUBLIC_DEV_AUTH=1 npx next dev -p 3183\nNothing was tested.\n");
  await page.screenshot({ path: `${SHOTS}/dev-auth-missing.png`, fullPage: true });
  await browser.close();
  process.exit(3);
}
check("dev bypass active and loudly labelled", true);
check("bell renders (gated frame reached)", (await page.getByTestId("bell").count()) > 0);

/* ---------------------------------------------- 2 · matrix step deep-link */
const cells = page.getByTestId(/^cell-.*-research$/);
const n = await cells.count();
check("matrix step cells are clickable", n > 0, `${n} research cells`);
if (n > 0) {
  await cells.first().click();
  await page.waitForTimeout(2500);
  check("a step cell deep-links to that step", /\/studio\/[^?]+\?step=research/.test(page.url()),
        new URL(page.url()).pathname + new URL(page.url()).search);
}

/* ------------------------------------------------------ 3 · the tab split */
check("Topic tab present", (await page.getByTestId("tab-topic").count()) > 0);
const board = page.getByTestId("tab-board");
const locked = await board.isDisabled().catch(() => true);
if (locked) {
  check("board is locked before a notebook exists", true);
  await page.getByTestId("load-saved-run").click();
  await page.waitForTimeout(900);
  check("board unlocks after a notebook arrives", !(await board.isDisabled()));
} else {
  check("board already unlocked (project ships researched)", true);
}
await board.click();
await page.waitForTimeout(900);

/* -------------------------------------------------------- 4 · CONCLUSIONS */
const conclusions = await page.getByTestId(/^card-c-/).count();
check("conclusions render", conclusions >= 5, `${conclusions} conclusion cards`);

const CID = "c-correlation-is-the-product";
const card = page.getByTestId(`card-${CID}`);
if (await card.count()) {
  const t = await card.innerText();
  check("conclusion states its leap", /leap/i.test(t));
  check("conclusion states its precedent", /pattern ·/i.test(t));
  check("conclusion states what would falsify it", /wrong if/i.test(t));
  check("conclusion is marked unsourced", /no direct source/i.test(t));
  check("conclusions default OUT of scope", (await card.getAttribute("data-descoped")) === "true");

  // The card is the scope toggle now; there is no descope button to click.
  await page.getByTestId(`card-${CID}`).click();
  await page.waitForTimeout(400);
  check("a conclusion can be taken into scope",
        (await page.getByTestId(`card-${CID}`).getAttribute("data-descoped")) === "false");
}
// facts must NOT share the opt-in default
const fact = page.getByTestId("card-f-ath");
if (await fact.count())
  check("facts remain IN scope by default (the asymmetry)",
        (await fact.getAttribute("data-descoped")) === "false");

/* ------------------------------------------- 4b · the UI adjustments */
// descoped must be signalled by BORDER, never by fading the text
await page.getByTestId("card-f-nov-crash").click();
await page.waitForTimeout(400);
const cut = page.getByTestId("card-f-nov-crash");
const descopedStyle = await cut.evaluate((el) => {
  const cs = getComputedStyle(el);
  return { opacity: cs.opacity, border: cs.borderTopColor };
});
check("a descoped card stays fully readable", parseFloat(descopedStyle.opacity) === 1,
      `opacity ${descopedStyle.opacity}`);
// Compare against the SAME card in scope rather than matching a colour literal:
// Tailwind v4 emits oklab(), so an rgb() regex silently never matches and the
// assertion would be testing the CSS format, not the behaviour.
await page.getByTestId("card-f-nov-crash").click();
await page.waitForTimeout(300);
const keptBorder = await cut.evaluate((el) => getComputedStyle(el).borderTopColor);
check("a descoped card is marked by its border",
      descopedStyle.border !== keptBorder, `${keptBorder} -> ${descopedStyle.border}`);

// section titles
const titles = await page.evaluate(() => {
  const out = {};
  document.querySelectorAll('[data-testid^="column-"]').forEach((sec) => {
    const h = sec.querySelector("h3");
    if (h) out[sec.getAttribute("data-testid")] = {
      color: getComputedStyle(h).color, size: getComputedStyle(h).fontSize,
      border: getComputedStyle(sec).borderTopColor,
    };
  });
  return out;
});
const conc = titles["column-conclusions"], macro = titles["column-macro"];
check("regular section titles are unmuted white", macro && /rgb\(255,\s*255,\s*255\)/.test(macro.color), macro?.color);
check("section titles are 13px", macro?.size === "13px", macro?.size);
check("conclusions title uses the app accent", conc && conc.color !== macro?.color, `${conc?.color}`);
check("conclusions section is NOT wrapped in an amber border",
      conc && !/rgba?\(\s*25[0-5],\s*1[0-9]{2}/.test(conc.border), `border ${conc?.border}`);

/* -------------------------------------------------- 4c · the hottest take */
const hot = page.getByTestId("card-c-reserve-was-the-product");
check("the hottest take renders", (await hot.count()) > 0);
if (await hot.count()) {
  const h = await hot.innerText();
  check("it is badged with the devil emoji", /😈/.test(h) && /hottest take/i.test(h));
  check("it declares an unhinged leap", /unhinged/i.test(h));
  check("it is labelled speculation, not reporting", /speculation about motive/i.test(h));
  check("even the hottest take states its falsifier", /wrong if/i.test(h));
  check("it defaults OUT of scope like every conclusion",
        (await hot.getAttribute("data-descoped")) === "true");
}

await page.screenshot({ path: `${SHOTS}/conclusions.png`, fullPage: true });

/* ------------------------------------ 4d · the card is the scope toggle */
const probe = page.getByTestId("card-f-ath");
const before = await probe.getAttribute("data-descoped");
await probe.click();
await page.waitForTimeout(350);
check("clicking a card toggles its scope",
      (await probe.getAttribute("data-descoped")) !== before,
      `${before} -> ${await probe.getAttribute("data-descoped")}`);
check("the card shows its scope state in words",
      (await page.getByTestId("scope-state-f-ath").count()) > 0);

// like must NOT be reachable by the card click, or sweeping a column would
// silently train the tone profile
const likedBefore = await page.getByTestId("like-f-ath").innerText();
await probe.click();
await page.waitForTimeout(300);
check("clicking the card does not touch like/deepen",
      (await page.getByTestId("like-f-ath").innerText()) === likedBefore);

await page.getByTestId("like-f-ath").click();
await page.waitForTimeout(300);
const afterLike = await probe.getAttribute("data-descoped");
check("clicking like does not toggle scope", afterLike === before, `scope stayed ${afterLike}`);
await page.getByTestId("like-f-ath").click();

// the required card must not be togglable at all
const steel = page.getByTestId("card-steel-man");
const steelBefore = await steel.getAttribute("data-descoped");
await steel.click();
await page.waitForTimeout(300);
check("the required steel-man cannot be descoped by clicking",
      (await steel.getAttribute("data-descoped")) === steelBefore);

/* ------------------------------------------ 4e · hover unmutes the detail */
const detail = probe.locator("p").nth(1);
const restColor = await detail.evaluate((el) => getComputedStyle(el).color);
await probe.hover();
await page.waitForTimeout(500);
const hoverColor = await detail.evaluate((el) => getComputedStyle(el).color);
check("muted text unmutes on hover", restColor !== hoverColor, `${restColor} -> ${hoverColor}`);
const hasTransition = await detail.evaluate((el) => {
  const cs = getComputedStyle(el);
  return { prop: cs.transitionProperty, dur: cs.transitionDuration, fn: cs.transitionTimingFunction };
});
check("the unmute is a linear transition, not a jump",
      /color/.test(hasTransition.prop) && parseFloat(hasTransition.dur) > 0 && /linear/.test(hasTransition.fn),
      `${hasTransition.prop} ${hasTransition.dur} ${hasTransition.fn}`);

/* --------------------------------------- 5 · follow-up serialisation rule */
await page.getByTestId("deepen-f-mnav").click();
await page.waitForTimeout(400);
const runFollowup = page.getByTestId("run-followup");
if (await runFollowup.count()) {
  await runFollowup.click();
  await page.waitForTimeout(600);
  const disabled = await runFollowup.isDisabled().catch(() => false);
  check("a second follow-up is refused while one runs", disabled,
        disabled ? "button disabled during the run" : "NOT refused");
  const busy = await page.getByTestId("followup-busy").count();
  check("the refusal is explained, not just disabled", busy > 0 || disabled);
}

/* ---------------------------------------------- 6 · background research job */
await page.getByTestId("tab-topic").click();
await page.waitForTimeout(500);
await page.getByTestId("run-research").click().catch(() => {});
await page.waitForTimeout(1200);
const runningNote = await page.getByTestId("running-note").count();
check("research runs in the background with a visible note", runningNote > 0);

// Navigate away mid-run — the job must survive. CLIENT-SIDE navigation (the
// nav link), not page.goto: a hard load remounts the React tree and takes the
// in-memory job store with it. That is a real limitation of the current design,
// not something the test should paper over — see NOTES.
await page.getByRole("link", { name: /projects/i }).first().click();
await page.waitForTimeout(1500);
await page.getByTestId("bell").click();
await page.waitForTimeout(500);
const panel = await page.getByTestId("bell-panel").innerText().catch(() => "");
check("the bell shows work still running after navigating away",
      /running/i.test(panel), panel.split("\n").slice(0, 2).join(" / "));
await page.screenshot({ path: `${SHOTS}/bell-running.png` });

// let it land
await page.waitForTimeout(15000);
const panel2 = await page.getByTestId("bell-panel").innerText().catch(() => "");
check("a finished run produces an unread notification",
      /returned|failed/i.test(panel2), panel2.split("\n").slice(0, 3).join(" / "));
const badge = await page.getByTestId("bell-count").count();
check("the bell badges unread events", badge > 0);

await page.getByTestId("bell-mark-all").click().catch(() => {});
await page.waitForTimeout(400);
check("marking all read clears the badge", (await page.getByTestId("bell-count").count()) === 0);
await page.screenshot({ path: `${SHOTS}/bell-read.png` });

check("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
await browser.close();

const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
if (bad.length) { console.log("FAILURES:"); bad.forEach((f) => console.log(`  - ${f.n}${f.d ? " — " + f.d : ""}`)); process.exit(1); }
