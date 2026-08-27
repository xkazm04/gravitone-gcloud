// WHERE A VENDOR-SUPPLIED URL IS ALLOWED TO POINT.
//
// SERVER ONLY. `fetchImageBase64` downloads a plate from a URL the VENDOR put in
// its response body — http.ts says so itself ("the far end is a URL a model
// handed us") — and it guarded how BIG that response may be and how LONG it may
// take, but never WHERE it pointed. A server-side fetch of an attacker-chosen
// address, whose body is returned to the caller as base64, is a server-side
// request forgery with a read channel attached: the interesting targets are the
// cloud metadata endpoint (which hands out instance credentials to anything that
// asks) and this machine's own loopback services.
//
// The same class was found and fixed in a sibling app in this fleet, on the same
// shape: a model-supplied URL whose response is fed back into the product. Its
// finding is the one worth repeating here — the first hop was checked and the
// REDIRECTS were not, so a legitimate CDN host answering `302 Location:
// http://169.254.169.254/…` walked straight through.
//
// Three checks, because each catches what the others cannot:
//
//   1. SCHEME — only http and https. `file:`, `data:`, `gopher:` and friends are
//      not downloads, and some are local reads.
//   2. LITERAL — an address written as an IP, or a hostname the cloud providers
//      reserve for metadata. DNS never sees these, so a resolver check misses
//      them entirely.
//   3. RESOLVED — what the hostname actually answers to, checked at connect
//      time, because a name under an attacker's control can point anywhere and
//      can be changed between two lookups.
//
// The result is a bounded, hop-by-hop redirect walk in `safeFetch`. It is
// deliberately stricter than "block RFC1918": link-local, carrier-grade NAT,
// unique-local v6 and the v4-mapped v6 forms are all here, because each of them
// has been somebody's bypass.

import { lookup } from "node:dns/promises";

/** Hostnames that resolve to a metadata service without DNS ever being asked. */
const METADATA_HOSTS = new Set([
  "metadata.google.internal",
  "metadata.goog",
  "metadata",
  "instance-data",
]);

/** Redirect hops to follow. Enough for a real CDN chain, few enough to bound. */
export const MAX_HOPS = 5;

export class BlockedUrlError extends Error {
  constructor(
    readonly url: string,
    readonly why: string,
  ) {
    super(`refused to fetch ${url}: ${why}`);
    this.name = "BlockedUrlError";
  }
}

/** True for an address no outbound vendor download has any business reaching. */
export function isPrivateAddress(ip: string): boolean {
  const a = ip.trim().toLowerCase();

  // IPv6, including the forms that carry a v4 address inside them.
  if (a.includes(":")) {
    if (a === "::" || a === "::1") return true;
    if (a.startsWith("fe80") || a.startsWith("fec0")) return true; // link-local, site-local
    if (/^f[cd][0-9a-f]{2}:/.test(a)) return true; // unique-local fc00::/7
    const mapped = /(?:^::ffff:|^::)((?:\d{1,3}\.){3}\d{1,3})$/.exec(a);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return false;
  }

  const p = a.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true; // unparseable is not safe
  const [x, y] = p as [number, number, number, number];
  if (x === 0 || x === 10 || x === 127) return true;
  if (x === 169 && y === 254) return true; // link-local AND 169.254.169.254
  if (x === 172 && y >= 16 && y <= 31) return true;
  if (x === 192 && y === 168) return true;
  if (x === 100 && y >= 64 && y <= 127) return true; // carrier-grade NAT
  if (x === 192 && y === 0) return true; // 192.0.0.0/24 and 192.0.2.0/24
  if (x >= 224) return true; // multicast and reserved
  return false;
}

/**
 * How a hostname becomes addresses.
 *
 * Injectable so the rules above can be driven OFFLINE and deterministically -
 * a guard whose test needs working DNS is a guard that goes red on a runner with
 * no network, and would then be relaxed by whoever is trying to get CI green.
 * Production passes nothing and gets the real resolver.
 */
export type Resolver = (host: string) => Promise<{ address: string }[]>;

const realResolver: Resolver = (host) => lookup(host, { all: true });

/**
 * Refuse a URL before it is fetched.
 *
 * Throws `BlockedUrlError` rather than returning a boolean: every caller here
 * has to stop, and a boolean is a thing a caller can forget to read.
 */
export async function assertFetchable(raw: string, resolve: Resolver = realResolver): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new BlockedUrlError(raw, "not a URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:")
    throw new BlockedUrlError(raw, `scheme ${u.protocol} is not a download`);

  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (METADATA_HOSTS.has(host)) throw new BlockedUrlError(raw, `${host} is a metadata service`);
  // An IP LITERAL is decided here; DNS is never asked about it.
  if (/^[\d.]+$/.test(host) || host.includes(":")) {
    if (isPrivateAddress(host)) throw new BlockedUrlError(raw, `${host} is a private address`);
    return u;
  }

  let addrs: { address: string }[];
  try {
    addrs = await resolve(host);
  } catch {
    throw new BlockedUrlError(raw, `${host} does not resolve`);
  }
  if (addrs.length === 0) throw new BlockedUrlError(raw, `${host} resolves to nothing`);
  // EVERY answer must be public. One private address among several is enough to
  // refuse: which one the connection picks is not ours to decide.
  for (const { address } of addrs)
    if (isPrivateAddress(address))
      throw new BlockedUrlError(raw, `${host} resolves to the private address ${address}`);
  return u;
}

/**
 * Fetch, following redirects OURSELVES so every hop is checked.
 *
 * `redirect: "manual"` is the whole point: the platform's automatic following
 * validates nothing, so a first hop that passes and then answers 302 to a
 * private address defeats a pre-flight check completely.
 */
export async function safeFetch(
  raw: string,
  init: RequestInit = {},
  resolve: Resolver = realResolver,
): Promise<Response> {
  let target = raw;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    await assertFetchable(target, resolve);
    const res = await fetch(target, { ...init, redirect: "manual" });
    if (res.status < 300 || res.status > 399) return res;
    const next = res.headers.get("location");
    if (!next) return res; // a 3xx with nowhere to go is the vendor's problem, not a redirect
    target = new URL(next, target).toString();
  }
  throw new BlockedUrlError(raw, `more than ${MAX_HOPS} redirects`);
}
