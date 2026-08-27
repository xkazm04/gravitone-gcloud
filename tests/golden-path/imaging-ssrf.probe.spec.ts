// LANE — A VENDOR CANNOT POINT THIS SERVER AT ITSELF (dynamic).
//
// `fetchImageBase64` downloads a plate from a URL the VENDOR put in its response
// body. http.ts says as much in its own comment ("the far end is a URL a model
// handed us") and bounded how BIG and how SLOW that answer may be — never where
// it pointed. A server-side fetch of an attacker-chosen address whose body comes
// back as base64 is a request forgery with a read channel attached, and the two
// targets that matter are the cloud metadata endpoint (instance credentials, to
// anything that asks) and this machine's own loopback services.
//
// THE HALF THAT IS EASY TO MISS is the redirect. A pre-flight check on the first
// hop is defeated by a legitimate CDN host answering `302 Location:
// http://169.254.169.254/…`, so every hop is re-checked and the walk is bounded.
import { test, expect } from "@playwright/test";

import { fetchImageBase64 } from "@/lib/imaging/http";
import { ImagingError } from "@/lib/imaging/errors";
import {
  assertFetchable,
  isPrivateAddress,
  MAX_HOPS,
  BlockedUrlError,
  type Resolver,
} from "@/lib/imaging/safeUrl";

/** A resolver, so every case below runs OFFLINE and deterministically. A guard
 *  whose test needs working DNS goes red on a runner with no network, and is
 *  then relaxed by whoever is trying to get the pipeline green. */
const RESOLVES: Record<string, string[]> = {
  "cdn.example.com": ["93.184.216.34"],
  "sneaky.example.com": ["10.0.0.5"],
  "split.example.com": ["93.184.216.34", "127.0.0.1"],
};
const fakeResolver: Resolver = async (host) => {
  const a = RESOLVES[host];
  if (!a) throw new Error(`no record for ${host}`);
  return a.map((address) => ({ address }));
};

const realFetch = globalThis.fetch;
test.afterEach(() => {
  globalThis.fetch = realFetch;
});

/** What the download did: the error kind, or "downloaded" when it went through. */
async function attempt(url: string): Promise<string> {
  try {
    await fetchImageBase64("leonardo", url, 5_000, fakeResolver);
    return "downloaded";
  } catch (e) {
    if (e instanceof ImagingError) return e.kind;
    throw e;
  }
}

// ── The address classifier, over the forms that have each been a bypass ──────

test("every private form is refused, and public addresses are not", () => {
  for (const ip of [
    "127.0.0.1", "0.0.0.0", "10.1.2.3", "172.16.0.1", "172.31.255.255",
    "192.168.1.1", "169.254.169.254", "100.64.0.1", "192.0.0.1", "224.0.0.1",
    "::1", "::", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254",
  ])
    expect(isPrivateAddress(ip), `${ip} should be private`).toBe(true);

  for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700::1111"])
    expect(isPrivateAddress(ip), `${ip} should be public`).toBe(false);
});

test("172.15 and 172.32 are public — the /12 boundary is off-by-one bait", () => {
  expect(isPrivateAddress("172.15.0.1")).toBe(false);
  expect(isPrivateAddress("172.32.0.1")).toBe(false);
  expect(isPrivateAddress("172.16.0.1")).toBe(true);
  expect(isPrivateAddress("172.31.0.1")).toBe(true);
});

test("a non-http scheme is not a download", async () => {
  for (const u of ["file:///etc/passwd", "data:image/png;base64,AAAA", "gopher://x/1"])
    await expect(assertFetchable(u, fakeResolver), u).rejects.toBeInstanceOf(BlockedUrlError);
});

test("a metadata hostname is refused without asking DNS", async () => {
  await expect(
    assertFetchable("http://metadata.google.internal/computeMetadata/v1/", fakeResolver),
  ).rejects.toThrow(/metadata service/);
});

test("a hostname that RESOLVES to a private address is refused — DNS rebinding's shape", async () => {
  await expect(assertFetchable("https://sneaky.example.com/plate.png", fakeResolver)).rejects.toThrow(
    /private address 10\.0\.0\.5/,
  );
});

test("one private answer among several is enough to refuse", async () => {
  // Which address the connection picks is not ours to decide, so a split
  // response cannot be treated as safe because one of its answers is.
  await expect(assertFetchable("https://split.example.com/plate.png", fakeResolver)).rejects.toThrow(
    /private address 127\.0\.0\.1/,
  );
});

// ── The real download path ───────────────────────────────────────────────────

test("the metadata endpoint is refused, and no fetch is issued", async () => {
  let called = 0;
  globalThis.fetch = (async () => {
    called++;
    return new Response("SECRET", { status: 200 });
  }) as typeof fetch;

  const kind = await attempt("http://169.254.169.254/latest/meta-data/iam/security-credentials/");
  console.log(`[imaging] metadata endpoint -> ${kind}, fetches issued: ${called}`);
  expect(kind).toBe("bad-response");
  expect(called, "the request was actually made").toBe(0);
});

test("loopback is refused", async () => {
  globalThis.fetch = (async () => new Response("x", { status: 200 })) as typeof fetch;
  expect(await attempt("http://127.0.0.1:3187/api/imaging/pricing")).toBe("bad-response");
});

test("A REDIRECT to a private address is refused — the hop a pre-flight check misses", async () => {
  const seen: string[] = [];
  globalThis.fetch = (async (u: string) => {
    seen.push(String(u));
    if (String(u).includes("cdn.example.com"))
      return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/creds" } });
    return new Response("SECRET", { status: 200 });
  }) as unknown as typeof fetch;

  const kind = await attempt("https://cdn.example.com/plate.png");
  console.log(`[imaging] cdn -> 302 -> metadata: ${kind}; hops attempted: ${seen.length}`);
  expect(kind).toBe("bad-response");
  // The first hop is legitimate and IS fetched; the second must never be.
  expect(seen.some((u) => u.includes("169.254")), "the redirect target was fetched").toBe(false);
});

test("a redirect loop is bounded rather than followed for ever", async () => {
  let hops = 0;
  globalThis.fetch = (async (u: string) => {
    hops++;
    return new Response(null, { status: 302, headers: { location: `${String(u)}?${hops}` } });
  }) as unknown as typeof fetch;

  const kind = await attempt("https://cdn.example.com/plate.png");
  console.log(`[imaging] redirect loop -> ${kind} after ${hops} hop(s), cap ${MAX_HOPS}`);
  expect(kind).toBe("bad-response");
  expect(hops).toBeLessThanOrEqual(MAX_HOPS + 1);
});

test("an ordinary public plate still downloads", async () => {
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
  globalThis.fetch = (async () =>
    new Response(png, { status: 200, headers: { "content-type": "image/png" } })) as typeof fetch;

  const out = await fetchImageBase64("leonardo", "https://cdn.example.com/plate.png", 5_000, fakeResolver);
  expect(out.mime).toBe("image/png");
  expect(out.base64.length).toBeGreaterThan(0);
});
