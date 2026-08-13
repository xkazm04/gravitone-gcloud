/**
 * Drive /library → Assets: the seed, the tree, the gallery, the context menu.
 *
 *   NEXT_PUBLIC_DEV_AUTH=1 npx next dev -p 3184
 *   node pipeline/drive-assets.mjs [baseURL]
 *
 * The checks that matter are the ones a typecheck cannot make: that the shelf
 * SEEDS from the trial index at all, that every tile's image actually loads
 * (a broken src renders as a silent empty box, not an error), and that removal
 * both takes effect and survives a reload.
 */
import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://localhost:3184";

const results = [];
const check = (n, ok, d = "") => {
  results.push({ n, ok, d });
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(`${BASE}/library`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

check("dev-auth reached /library", new URL(page.url()).pathname === "/library", page.url());

// --- the module tabs
for (const label of ["Styles", "Assets", "Animations"])
  check(`module tab "${label}" exists`, await page.getByRole("button", { name: label, exact: true }).isVisible());

await page.getByRole("button", { name: "Assets", exact: true }).click();
await page.waitForTimeout(2000); // seed = fetch + IndexedDB write

// --- the seed
const tiles = page.locator("figure");
const n = await tiles.count();
check("shelf seeded from the trial grid", n === 30, `${n} tiles`);

// --- the folder tree, as asked: styles › presets › one folder per preset
const tree = page.getByRole("navigation", { name: "Asset folders" });
check("category 'styles' present", await tree.getByText("styles", { exact: true }).isVisible());
check("child folder 'presets' present", await tree.getByText("presets", { exact: true }).isVisible());
for (const p of ["signal-ledger", "blueprint", "data-neon"])
  check(`preset folder '${p}' present`, await tree.getByText(p, { exact: true }).isVisible());

// --- selecting one preset narrows to its five plates
await tree.getByText("blueprint", { exact: true }).click();
await page.waitForTimeout(400);
const five = await page.locator("figure").count();
check("a preset folder holds 5 images", five === 5, `${five} tiles`);

// --- every image actually decoded. A wrong src is invisible otherwise.
const broken = await page.$$eval("figure img", (imgs) =>
  imgs.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute("src")),
);
check("every visible image loaded", broken.length === 0, broken.slice(0, 3).join(", "));

// --- the context menu
await page.locator("figure").first().click({ button: "right" });
await page.waitForTimeout(300);
const menu = page.getByRole("menu");
check("right-click opens a context menu", await menu.isVisible());
check("menu offers removal", await menu.getByRole("menuitem", { name: /remove/i }).isVisible());

// Escape must dismiss it — a menu you cannot close without clicking is a trap.
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
check("Escape closes the menu", (await page.getByRole("menu").count()) === 0);

// --- removal takes effect, and sticks
await page.locator("figure").first().click({ button: "right" });
await page.waitForTimeout(300);
await page.getByRole("menuitem", { name: /remove/i }).click();
await page.waitForTimeout(600);
const afterRemove = await page.locator("figure").count();
check("removal drops the tile", afterRemove === 4, `${afterRemove} tiles`);

await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1800);
await page.getByRole("button", { name: "Assets", exact: true }).click();
await page.waitForTimeout(1200);
const afterReload = await page.locator("figure").count();
check("removal survives a reload", afterReload === 29, `${afterReload} tiles`);

// An emptied shelf must not silently refill — the seed mark has to outlive the
// assets it created.
check("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));

await browser.close();
const bad = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);
