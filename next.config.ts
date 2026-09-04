import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A second `next dev` in the same project refuses to start: the first one
  // holds a lock inside the build directory. That is right for humans and wrong
  // for automation, which needs its own server (with NEXT_PUBLIC_DEV_AUTH=1)
  // alongside whatever the developer already has running.
  //
  // Giving the drive script its own dist dir gives it its own lock:
  //   NEXT_DIST_DIR=.next-drive NEXT_PUBLIC_DEV_AUTH=1 npx next dev -p 3183
  //
  // Defaults to `.next`, so an ordinary `npm run dev` / `npm run build` is
  // completely unchanged.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

// ── DevInspector — keeping the overlay out of what ships ────────────────────
//
// app/layout.tsx mounts the inspector behind `process.env.NODE_ENV ===
// "development"`, which is enough to stop it RUNNING in production and not
// enough to stop it SHIPPING: a `"use client"` module imported by a Server
// Component is a client-reference entry point, emitted whether or not any branch
// reaches it. Measured 2026-08-30 on a real `npm run build` — the minified
// overlay was in a browser chunk. So the module is swapped out of the graph for
// production builds rather than being reasoned out of it, and
// pipeline/check-bundle.mjs reads the emitted chunks for `data-devinspector` so
// that a broken alias fails a gate instead of quietly shipping devtools.
//
// The stand-in is a plain server component returning null (no "use client"), so
// production carries no client reference at all. Dev is untouched: the overlay
// stays mounted in a plain `npm run dev` too, where it tells you that stamping
// is off and how to turn it on.
if (process.env.NODE_ENV === "production") {
  nextConfig.turbopack = {
    ...nextConfig.turbopack,
    resolveAlias: {
      ...nextConfig.turbopack?.resolveAlias,
      // Project-root-relative, forward slashes. NOT an absolute path: Turbopack
      // rejects a Windows one outright ("windows imports are not implemented
      // yet"), which is a build-time failure on the only platform this repo is
      // developed on — measured 2026-08-30, `next build` red with exactly that.
      "@/app/_dev-inspector/DevInspector": "./app/_dev-inspector/DevInspectorAbsent.tsx",
    },
  };
}

// ── DevInspector — dev-only source-location stamping ────────────────────────
//
// `npm run dev:inspect` sets DEV_INSPECT=1, which registers the loader below.
// It writes each host JSX element's own `app/.../File.tsx:LINE:COL` into the DOM
// as `data-loc`, and the overlay in app/_dev-inspector/ turns a right-click on
// any pixel into that path on the clipboard. See pipeline/dev-inspector/.
//
// OPT-IN BY CONSTRUCTION. A plain `npm run dev`, `npm test`, the drive scripts
// and every production build see this branch not taken: no rule, no loader, no
// attribute, nothing to strip later.
//
// THE `condition` IS LOAD-BEARING, not a nicety. Turbopack runs JS loaders in
// node subprocess workers, and Windows does not cascade a kill down a process
// tree. The sibling `kp` repo measured what an unconditioned `*.tsx` rule costs:
// one dev session stranded ~2,800 parked node workers holding 15.8 GB, because
// every module in the graph — node_modules and Next's own internals included —
// was dispatched to a worker even though the loader no-ops on them.
// `{ not: "foreign" }` keeps them out of the dispatch entirely, and
// pipeline/dev-guard.mjs reaps the tree on exit and trips a breaker at
// DEV_GUARD_MAX_NODE, so neither half can run away.
if (process.env.DEV_INSPECT === "1" && process.env.DEV_INSPECT_BUNDLER !== "webpack") {
  const loader = path.join(import.meta.dirname, "pipeline", "dev-inspector", "source-loc-loader.cjs");
  // NOT restricted to the `browser` condition: a host element rendered by a
  // Server Component reaches the DOM through the RSC payload, so the server
  // compile has to be stamped too or server-rendered markup carries no data-loc.
  const inspectorRule: NonNullable<NonNullable<NextConfig["turbopack"]>["rules"]>[string] = {
    condition: { all: [{ not: "foreign" }, "development"] },
    loaders: [{ loader, options: { rootDir: import.meta.dirname } }],
  };
  nextConfig.turbopack = {
    ...nextConfig.turbopack,
    rules: { "*.tsx": inspectorRule, "*.jsx": inspectorRule },
  };
}

// The webpack escape hatch — `npm run dev:inspect:webpack`. Same stamps, slower
// compile; reach for it only if the Turbopack path misbehaves. A `webpack` key
// merely PRESENT in the config makes `next build` fail fast under Turbopack,
// which is why it stays behind the env gate rather than being declared inline.
if (process.env.DEV_INSPECT === "1" && process.env.DEV_INSPECT_BUNDLER === "webpack") {
  const loader = path.join(import.meta.dirname, "pipeline", "dev-inspector", "source-loc-loader.cjs");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nextConfig.webpack = (config: any) => {
    config.module = config.module || { rules: [] };
    config.module.rules = config.module.rules || [];
    config.module.rules.push({
      test: /\.[jt]sx$/,
      exclude: /[\\/]node_modules[\\/]/,
      enforce: "pre",
      use: [{ loader, options: { rootDir: import.meta.dirname } }],
    });
    return config;
  };
}

export default nextConfig;
