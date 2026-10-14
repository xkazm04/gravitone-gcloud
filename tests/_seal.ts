// THE NODE LANE'S NETWORK SEAL. Installed by playwright.config.ts, which Playwright loads in the
// runner AND in every worker, so it covers every spec in tests/golden-path.
//
// A probe that reaches a real host by accident passes or fails on the network's state, and the
// gate cannot tell. Until 2026-10-14 the `probes` gate cited `sealNetwork()` as this guarantee,
// but that function seals only the standalone pipeline/integration-imaging.mts script, which no
// gate runs; 243 of 284 specs replaced nothing. This seal is the lane's own:
//   - loopback (localhost, 127.0.0.0/8, ::1) and data:/blob:/file: URLs pass - probes start local
//     servers and read fixtures;
//   - any other host is REFUSED with an error naming it (fetch, http.request/get,
//     https.request/get), so the probe fails loudly instead of depending on the internet.
// A spec that stubs `globalThis.fetch` keeps working: its stub replaces the sealed fetch and its
// restore puts the seal back. tests/golden-path/network-seal.probe.spec.ts is the negative control.

import http from "node:http";
import https from "node:https";

const SEALED = Symbol.for("gravitone.networkSeal");
type Sealable = { [SEALED]?: true };

function isLoopback(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  return h === "localhost" || h === "::1" || /^127\.\d+\.\d+\.\d+$/.test(h);
}

export function sealedError(target: string): Error {
  return new Error(`network sealed: the node probe lane refuses ${target} (tests/_seal.ts) - stub it or move the probe to the live lane`);
}

function urlOf(input: unknown): URL | null {
  try {
    if (input instanceof URL) return input;
    if (typeof input === "string") return new URL(input);
    if (input && typeof input === "object" && "url" in input && typeof input.url === "string") return new URL(input.url);
  } catch (cause) {
    // A relative or malformed URL never reaches a socket; let the real fetch report it.
    void cause;
  }
  return null;
}

function allowedUrl(u: URL): boolean {
  if (u.protocol === "data:" || u.protocol === "blob:" || u.protocol === "file:") return true;
  return isLoopback(u.hostname);
}

function hostOfRequestArgs(args: readonly unknown[]): string | null {
  const first = args[0];
  if (typeof first === "string" || first instanceof URL) {
    const u = urlOf(first);
    return u ? u.hostname : null;
  }
  if (first && typeof first === "object") {
    const o = first as { hostname?: unknown; host?: unknown };
    const h = typeof o.hostname === "string" ? o.hostname : typeof o.host === "string" ? o.host : "localhost";
    return h.replace(/:\d+$/, "");
  }
  return "localhost";
}

function sealModule(mod: typeof http | typeof https, scheme: string): void {
  for (const name of ["request", "get"] as const) {
    const original = mod[name] as ((...a: unknown[]) => http.ClientRequest) & Sealable;
    if (original[SEALED]) continue;
    const sealed = ((...args: unknown[]) => {
      const host = hostOfRequestArgs(args);
      if (host !== null && !isLoopback(host)) throw sealedError(`${scheme}://${host}`);
      return original.apply(mod, args);
    }) as typeof original;
    sealed[SEALED] = true;
    Object.assign(mod, { [name]: sealed });
  }
}

export function installNetworkSeal(): void {
  const current = globalThis.fetch as typeof fetch & Sealable;
  if (!current[SEALED]) {
    const real = current;
    const sealed = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const u = urlOf(input);
      if (u && !allowedUrl(u)) throw sealedError(u.origin);
      return real(input, init);
    }) as typeof fetch & Sealable;
    sealed[SEALED] = true;
    globalThis.fetch = sealed;
  }
  sealModule(http, "http");
  sealModule(https, "https");
}
