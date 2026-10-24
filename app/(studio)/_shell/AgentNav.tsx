"use client";

// Registers the studio's navigation tools (./agentNav.ts) on `document.modelContext` - only when a
// page bridge has put one there (athena-portable's inject.js polyfill, or a browser's native
// WebMCP). With no bridge it does nothing: no global is created, nothing is drawn. Unmounting the
// shell aborts the registration's signal, which unregisters every tool (the bridge's own reaper).
//
// A navigation answers once the address is on screen: the router's push is fire-and-forget, so the
// tool waits for the browser's location to read the target and the main region to hold the page
// (bounded below the bridge's 30 s call timeout), then reports the heading it drew, if it draws one.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { NAV_TOOLS, SECTION_LIST, hereOf, sectionHref, studioPath, type Here, type NavToolName } from "./agentNav.ts";

/** Below inject.js's 30 s per-call timeout, so a slow page answers `still loading` rather than `timeout`. */
const ARRIVE_MS = 20_000;
const POLL_MS = 100;

type Registry = { registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void };

const currentPath = (): string => `${window.location.pathname}${window.location.search}`;
const heading = (): string | null => document.querySelector("main#content h1, main#content h2")?.textContent?.trim() || null;
const here = (): Here => hereOf(currentPath(), document.title, heading());

async function arrive(target: string, signal: AbortSignal): Promise<Here | { readonly error: string }> {
  const until = Date.now() + ARRIVE_MS;
  while (Date.now() < until && !signal.aborted) {
    // The new address AND a drawn page, not just the URL: the main region holds the new route's content.
    if (currentPath() === target && (document.querySelector("main#content")?.childElementCount ?? 0) > 0) return here();
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  return { error: `${target} was not on screen after ${ARRIVE_MS / 1000} s (now ${currentPath()})` };
}

export function AgentNav() {
  // The App Router's instance is stable for the page's life, so the tools register once.
  const router = useRouter();

  useEffect(() => {
    const registry = (document as Document & { modelContext?: Registry }).modelContext;
    if (registry === undefined || typeof registry.registerTool !== "function") return;
    const abort = new AbortController();
    const go = async (target: string, signal: AbortSignal) => {
      router.push(target);
      return arrive(target, signal);
    };
    const run: { readonly [K in NavToolName]: (input: Record<string, unknown>, signal: AbortSignal) => Promise<unknown> } = {
      where_am_i: async () => ({ ...here(), sections: SECTION_LIST }),
      go_to: async (input, signal) => {
        const href = sectionHref(input["section"]);
        return href === undefined ? { error: `no studio section "${String(input["section"])}"` } : go(href, signal);
      },
      open: async (input, signal) => {
        const p = studioPath(input["path"]);
        return p.ok ? go(p.path, signal) : { error: p.reason };
      },
    };
    for (const tool of NAV_TOOLS) {
      registry.registerTool(
        { ...tool, execute: (input: unknown, opts: { signal: AbortSignal }) => run[tool.name]((input ?? {}) as Record<string, unknown>, opts.signal) },
        { signal: abort.signal },
      );
    }
    return () => abort.abort();
  }, [router]);

  return null;
}
