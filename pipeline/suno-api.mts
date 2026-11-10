// SUNO'S OFFICIAL API FROM A TERMINAL - `npm run suno:api -- <verb>`. Read-only: no verb spends.
//
//   status                    the grant on this machine (file only, no network)
//   usage                     GET /v0/account/usage, printed as JSON
//   clip <id>                 GET /v0/audio/<id>, printed as JSON
//   stream <id> [--out <f>]   GET /v0/audio/<id>/stream: writes the bytes (default <id>.<ext> here),
//                             prints status, content-type, byte count and every response header
//                             naming a price, credit or quota - the measurement of whether a
//                             stream is free and whole
//
// The grant is made in the studio (GET /api/suno/connect); this CLI shares its file
// (<sound store>/suno-api/auth.json, SOUND_STORE_DIR moves it) and refreshes under the same lock.
// Loads .env and .env.local (lib/envFile.ts); an exported value wins. A failure prints the
// vendor's sentence and exits 1.

import { writeFile } from "node:fs/promises";
import path from "node:path";

import type { Result } from "@gt/domain/errors";

import { loadEnvFiles } from "../lib/envFile.ts";
import { sunoApi, sunoApiStatus } from "../lib/suno/api/client.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
loadEnvFiles(ROOT);

const EXT: Record<string, string> = { "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/flac": "flac", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/aac": "aac" };

function usage(): never {
  console.error("usage: npm run suno:api -- status | usage | clip <id> | stream <id> [--out <file>]");
  process.exit(2);
}

function unwrap<T>(r: Result<T>): T {
  if (r.ok) return r.value;
  console.error(`${r.error.code}${r.error.detail ? ` (${r.error.detail})` : ""}: ${r.error.message}`);
  process.exit(1);
}

async function main(argv: string[]): Promise<void> {
  const [verb, ...rest] = argv;
  const api = sunoApi();
  switch (verb) {
    case "status": {
      const s = await sunoApiStatus();
      if (!s.connected) console.log(`not connected: ${s.reason}`);
      else console.log(`connected, scope "${s.scope}", access token expires ${new Date(s.expiresAt).toISOString()}`);
      return;
    }
    case "usage":
      console.log(JSON.stringify(unwrap(await api.usage()), null, 2));
      return;
    case "clip": {
      const id = rest[0];
      if (!id) usage();
      console.log(JSON.stringify(unwrap(await api.getClip(id)), null, 2));
      return;
    }
    case "stream": {
      const id = rest[0];
      if (!id || id.startsWith("--")) usage();
      const at = rest.indexOf("--out");
      const out = at >= 0 ? rest[at + 1] : undefined;
      if (at >= 0 && !out) usage();
      const s = unwrap(await api.stream(id));
      const mime = s.mime.split(";")[0]!.trim().toLowerCase();
      const file = path.resolve(out ?? `${id}.${EXT[mime] ?? "bin"}`);
      await writeFile(file, s.bytes);
      console.log(`status ${s.status}`);
      console.log(`content-type ${s.mime}`);
      console.log(`bytes ${s.bytes.byteLength}`);
      const billing = Object.entries(s.billingHeaders);
      if (billing.length === 0) console.log("price/credit/quota headers: none");
      for (const [k, v] of billing) console.log(`header ${k}: ${v}`);
      console.log(`wrote ${file}`);
      return;
    }
    default:
      usage();
  }
}

main(process.argv.slice(2)).then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  },
);
