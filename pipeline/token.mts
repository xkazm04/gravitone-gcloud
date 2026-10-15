// CLI TOKENS - the operator mints one credential per caller, lists them, revokes them.
//
//   node pipeline/token.mts mint --name <caller> --scope money|read [--ttl 30d] [--json]
//   node pipeline/token.mts list [--json]
//   node pipeline/token.mts revoke <id> [--reason "<why>"] [--json]
//
// Replaces the one shared IMAGING_ACCESS_SECRET every script, skill and curl
// line used to copy (lib/apiAuth.ts records why). A caller keeps its token in
// GRAVITONE_CLI_TOKEN and sends `Authorization: Bearer $GRAVITONE_CLI_TOKEN`;
// both doors (lib/apiAuth.ts resolvePrincipal for every v1 route,
// app/_server/route.ts guardOf for the new ones) verify it against the store
// this script writes.
//
// THE SAME STORE THE SERVER OPENS. The location rule is @gt/kernel/process's
// storeLocation, bound to v1's universe exactly as lib/kernelStore.ts binds
// it: GRAVITONE_STORE_PATH, else <cwd>/<foundry-out|fixtures-out>/
// gravitone.sqlite by NEXT_PUBLIC_GRAVITONE_DATA. Run it from the checkout root
// with the server's environment, or the token lands in a store nobody reads.
//
// THE TOKEN IS PRINTED ONCE, and only after its row and its `token.mint` event
// committed: a token printed for a mint that rolled back would authenticate
// nowhere and be revocable by no one. The store keeps a hash; nothing here or
// in the ledger can print it again. `list` never shows a secret.
//
// Exit 0 done · 1 refused (bad input, unknown id) · 2 could not run (store).
// Runs under plain `node` (type stripping): erasable TypeScript only.

import { userInfo } from "node:os";

import type { Actor } from "@gt/domain/event";
import { listTokens, mintToken, parseTtl, revokeToken, TOKEN_SCOPES, type TokenRecord, type TokenScope } from "@gt/kernel/token";

import { closeProcessKernel, processKernel, storeLocation } from "@gt/kernel/process";

import { OUT_DIRNAME } from "../lib/fixtures/mode.ts";

const USAGE = [
  "usage:",
  "  node pipeline/token.mts mint --name <caller> --scope money|read [--ttl 30d] [--json]",
  "  node pipeline/token.mts list [--json]",
  "  node pipeline/token.mts revoke <id> [--reason \"<why>\"] [--json]",
].join("\n");

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");

function flag(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

/** The operator, as the ledger names them: the OS account that ran the act. */
function operator(): Actor {
  let id = "operator";
  try {
    id = userInfo().username || id;
  } catch (e) {
    // A container with no passwd entry: the act is still the operator's.
    console.error(`[token] no OS username (${e instanceof Error ? e.message : String(e)}); recording the actor as "operator"`);
  }
  return { kind: "operator", id };
}

function fail(code: 1 | 2, message: string): never {
  if (JSON_OUT) process.stdout.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  else console.error(`[token] ${message}`);
  closeProcessKernel();
  process.exit(code);
}

function row(t: TokenRecord, now: number): string {
  const state = t.revokedAt !== undefined ? `revoked ${t.revokedAt}` : Date.parse(t.expiresAt) <= now ? "expired" : "live";
  return `${t.id}  ${t.scope.padEnd(5)}  ${t.name.padEnd(24)}  expires ${t.expiresAt}  ${state}  last used ${t.lastUsedAt ?? "never"}`;
}

const verb = argv[0];
if (verb !== "mint" && verb !== "list" && verb !== "revoke") {
  console.error(USAGE);
  process.exit(verb === undefined || verb === "--help" ? 0 : 1);
}

const location = storeLocation(OUT_DIRNAME);
const opened = processKernel(location);
if (!opened.ok) fail(2, `the store at ${location} did not open: ${opened.error.message}`);
const store = opened.value.store;

if (verb === "mint") {
  const name = flag("name");
  const scope = flag("scope");
  const ttlText = flag("ttl");
  if (name === undefined || scope === undefined) fail(1, `mint needs --name and --scope\n${USAGE}`);
  const scoped: TokenScope | undefined = TOKEN_SCOPES.find((x) => x === scope);
  if (scoped === undefined) fail(1, `--scope ${scope} is not money|read`);
  const ttl = ttlText === undefined ? undefined : parseTtl(ttlText);
  if (ttl !== undefined && !ttl.ok) fail(1, ttl.error.message);
  const input = { name, scope: scoped, ...(ttl === undefined ? {} : { ttlMs: ttl.value }) };
  const minted = store.tx((t) => mintToken(t, input, operator()));
  if (!minted.ok) fail(minted.error.code === "invalid" ? 1 : 2, minted.error.message);
  const { record, token } = minted.value;
  if (JSON_OUT) process.stdout.write(`${JSON.stringify({ ok: true, ...record, token })}\n`);
  else {
    process.stdout.write(`${token}\n`);
    console.error(
      `[token] minted ${record.id} (${record.scope}) for ${record.name}, expires ${record.expiresAt}, in ${store.location}.\n` +
        "[token] This is the only time it is shown. Put it in the caller's GRAVITONE_CLI_TOKEN and send it as `Authorization: Bearer $GRAVITONE_CLI_TOKEN`.",
    );
  }
} else if (verb === "list") {
  const all = store.read((r) => listTokens(r));
  if (!all.ok) fail(2, all.error.message);
  const now = Date.now();
  if (JSON_OUT) process.stdout.write(`${JSON.stringify({ ok: true, store: store.location, tokens: all.value })}\n`);
  else if (all.value.length === 0) console.log(`no tokens minted in ${store.location}`);
  else for (const t of all.value) console.log(row(t, now));
} else {
  const id = argv[1];
  if (id === undefined || id.startsWith("--")) fail(1, `revoke needs a token id\n${USAGE}`);
  const reason = flag("reason");
  const done = store.tx((t) => revokeToken(t, id, operator(), reason));
  if (!done.ok) fail(done.error.code === "not-found" || done.error.code === "invalid" ? 1 : 2, done.error.message);
  if (JSON_OUT) process.stdout.write(`${JSON.stringify({ ok: true, state: done.value.state, token: done.value.token })}\n`);
  else console.log(`${done.value.state} ${id} (${done.value.token.name})`);
}

closeProcessKernel();
