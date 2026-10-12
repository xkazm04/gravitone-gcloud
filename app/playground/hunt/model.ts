// THE HUNT'S ARITHMETIC — pure, no React, no fetch, so a probe can drive every
// branch (tests/golden-path/sound-hunt.probe.spec.ts).
//
// A hunt (lib/sound/types.ts#Hunt) is a flat list of nodes linked by
// `parentId`, drafted by the text engine. Nothing in the contract promises the
// SHAPE of that list: the drafter may emit one root node carrying the idea with
// axes beneath it, or bare axes with no root, or leaves with no branch at all
// (an axis named only on the leaf). A board that trusted one shape would draw
// the others as a heap. So the shape is NORMALISED here, once:
//
//   root     the single parentless node, IF it has children — otherwise the
//            hunt's own `idea` is the root and no node is spent on it;
//   columns  one per top-level branch; a branch's descendants are listed
//            beneath it depth-first, inner branches as group rows;
//   loose    top-level leaves are gathered into a column per `axis`, because
//            the axis is the one thing every node carries.
//
// A LEAF is a node with no children, and only leaves render: a branch is a
// question ("which tempo?"), a leaf is an answer you can listen to.

export * from "./tree";
export * from "./huntLayout";
export * from "./selection";
export * from "./renderPlan";
export * from "./leaf";
export * from "./store";
export * from "./atRest";
export * from "./evidence";
