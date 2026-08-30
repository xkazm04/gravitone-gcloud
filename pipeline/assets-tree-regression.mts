// REGRESSION CONTROL for the derived folder tree (lib/assets.ts).
//
// Run:  npx tsx pipeline/assets-tree-regression.mts
//
// Folders in the asset shelf are DERIVED from the paths assets carry rather
// than stored, which removes a whole class of drift (an empty folder lingering
// after its last asset went, a folder missing while assets still claim it) and
// buys a different one: the derivation itself is now load-bearing, and it is
// recursive, which is where nesting bugs live.
//
// Paths are rooted at a DISCIPLINE ("educational", "trailer") or "shared" since
// WP1; rows written before that root existed still start at "styles". The
// tree is expected to show both roots, because both are on the shelf.
//
// Case 3 is the one that matters. Selecting a PARENT must show the whole
// subtree — "presets · 30" that opens onto an empty room is a lie with a
// tooltip, and it is exactly what a naive equality filter produces.

import { assetsUnder, buildTree, type Asset } from "../lib/assets";

const at = (path: string[], name: string): Asset => ({
  id: `${path.join("/")}/${name}`,
  uid: "u",
  path,
  name,
  src: `/x/${name}.jpg`,
  kind: "image",
  createdAt: 0,
});

const rows: Asset[] = [
  at(["educational", "styles", "presets", "blueprint"], "a"),
  at(["educational", "styles", "presets", "blueprint"], "b"),
  at(["educational", "styles", "presets", "data-neon"], "c"),
  at(["educational", "styles", "locked"], "d"),
  at(["clips"], "e"),
];

let bad = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) bad++;
  console.log(`${pass ? "OK  " : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const tree = buildTree(rows);

ok("roots are the distinct top segments, sorted", tree.map((n) => n.name).join(",") === "clips,educational",
   tree.map((n) => n.name).join(","));

const educational = tree.find((n) => n.name === "educational")!;
ok("the discipline root totals its whole subtree", educational.total === 4, `total=${educational.total}`);
const styles = educational.children.find((n) => n.name === "styles")!;
ok("a parent totals its whole subtree", styles.total === 4, `total=${styles.total}`);
ok("a parent holds no assets directly", styles.count === 0, `count=${styles.count}`);

const presets = styles.children.find((n) => n.name === "presets")!;
ok("nesting reaches depth 3", Boolean(presets), presets ? "found" : "missing");
ok("presets totals its children", presets.total === 3, `total=${presets.total}`);
ok("one child folder per preset", presets.children.map((c) => c.name).join(",") === "blueprint,data-neon",
   presets.children.map((c) => c.name).join(","));

const blueprint = presets.children.find((n) => n.name === "blueprint")!;
ok("a leaf counts its own assets", blueprint.count === 2 && blueprint.total === 2,
   `count=${blueprint.count} total=${blueprint.total}`);
ok("a node carries its full path", blueprint.path.join("/") === "educational/styles/presets/blueprint",
   blueprint.path.join("/"));

// --- selection
ok("empty selection shows everything", assetsUnder(rows, []).length === 5);
ok("a leaf shows only its own", assetsUnder(rows, ["educational", "styles", "presets", "blueprint"]).length === 2);
ok("A PARENT SHOWS ITS SUBTREE", assetsUnder(rows, ["educational", "styles", "presets"]).length === 3,
   `${assetsUnder(rows, ["educational", "styles", "presets"]).length} of 3`);
ok("the top parent shows all its descendants", assetsUnder(rows, ["educational"]).length === 4);

// A pre-WP1 row rooted at "styles" and a post-WP1 row rooted at a discipline
// stand side by side: the tree must show both, not fold one into the other.
const mixed = [...rows, at(["styles", "presets", "blueprint"], "old")];
ok("legacy and discipline roots coexist", buildTree(mixed).map((n) => n.name).join(",") === "clips,educational,styles",
   buildTree(mixed).map((n) => n.name).join(","));

// A sibling whose name is a prefix of another must not bleed across. "style"
// is not "styles", and a naive startsWith without the separator says it is.
const tricky = [...rows, at(["style"], "f")];
ok("prefix siblings do not bleed", assetsUnder(tricky, ["style"]).length === 1,
   `${assetsUnder(tricky, ["style"]).length} of 1`);

console.log(bad ? `\n${bad} REGRESSION FAILURE(S)` : "\nthe derived tree behaves correctly");
process.exit(bad ? 1 : 0);
