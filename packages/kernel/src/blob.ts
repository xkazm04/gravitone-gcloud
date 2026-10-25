import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { mimeSchema, type BlobRef } from "@gt/domain/blob";
import { err, ok, type Result } from "@gt/domain/errors";
import { sleep } from "./sleep.ts";

// BLOBS - content-addressed bytes on disk, beside the store, never in it.
//
// `<root>/ab/cdef...`: the first two hex digits of the sha256 name a fan-out
// directory, the other 62 the file. The address IS the content, so a write is
// idempotent by construction: the same bytes land on the same path, and a path
// that already holds them is not rewritten (a media file is often hundreds of
// MB; v1 rewrote whole files on every save).
//
// The write keeps v1's discipline (lib/sound/store.ts `writeBytesAtomic`,
// lib/articles/store.ts `writeFileAtomic`): a temp file in the SAME directory,
// then rename, so a reader sees the whole file or none; and the Windows retry,
// because a rename onto a path an indexer or a reader holds open fails with
// EPERM/EBUSY/EACCES for a few milliseconds (measured 2026-10-12: a stranded
// takes.json.<pid>.<n>.tmp beside a store that never got it). Upgraded: the
// temp is fsynced before the rename, so a power cut cannot leave a file whose
// name promises bytes it does not hold, and `read` re-hashes what it returns,
// so a damaged blob is an error, never silently wrong media.
//
// The mime type is carried on the ref, not in the address: the same bytes
// under two mimes are one file.

export type { BlobRef };

export type BlobStore = {
  readonly root: string;
  put(bytes: Uint8Array, mime: string): Promise<Result<BlobRef>>;
  /** Where a ref's bytes live; refuses a malformed digest rather than resolve it. */
  pathOf(ref: BlobRef): Result<string>;
  has(ref: BlobRef): Promise<boolean>;
  read(ref: BlobRef): Promise<Result<Uint8Array>>;
};

const SHA_RE = /^[0-9a-f]{64}$/;
const RENAME_RETRY = new Set(["EPERM", "EBUSY", "EACCES"]);
const RENAME_ATTEMPTS = 10;

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const codeOf = (e: unknown): string => (e instanceof Error && "code" in e && typeof e.code === "string" ? e.code : "");

async function sizeOf(file: string): Promise<number | undefined> {
  try {
    return (await stat(file)).size;
  } catch (e) {
    if (codeOf(e) === "ENOENT") return undefined;
    throw e;
  }
}

/** The sha256 of a file on disk, streamed so a media file is never held whole. */
async function digestOf(file: string): Promise<string> {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(file, { highWaterMark: 8 << 20 })) h.update(chunk);
  return h.digest("hex");
}

async function renameInto(tmp: string, file: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(tmp, file);
      return;
    } catch (e) {
      if (!RENAME_RETRY.has(codeOf(e)) || attempt >= RENAME_ATTEMPTS) throw e;
      // Jittered, so a reader polling on a fixed beat does not meet every retry.
      await sleep(Math.min(400, 10 * 2 ** attempt) * (0.5 + Math.random()));
    }
  }
}

export function blobStore(root: string): BlobStore {
  const pathOf = (ref: BlobRef): Result<string> =>
    SHA_RE.test(ref.sha256)
      ? ok(path.join(root, ref.sha256.slice(0, 2), ref.sha256.slice(2)))
      : err("invalid", `blob: "${ref.sha256.slice(0, 80)}" is not a sha256 digest`);

  return {
    root,
    pathOf,
    async put(bytes, mime) {
      // The ref is a domain record; refuse a mime its schema would refuse
      // later, rather than mint a ref no reader can parse.
      if (!mimeSchema.safeParse(mime).success) return err("invalid", `blob: "${mime.slice(0, 80)}" is not a type/subtype mime`);
      const ref: BlobRef = { sha256: sha256(bytes), bytes: bytes.byteLength, mime };
      const target = pathOf(ref);
      if (!target.ok) return target;
      const file = target.value;
      const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
      try {
        // A file of the right size at a content address is not rewritten - but it
        // is re-hashed first: bit rot or a hand edit that keeps the length would
        // otherwise leave a blob `read` reports as damaged damaged for good, with
        // putting the source bytes again unable to heal it (measured 2026-10-25).
        if ((await sizeOf(file)) === ref.bytes && (await digestOf(file)) === ref.sha256) return ok(ref);
        await mkdir(path.dirname(file), { recursive: true });
        const fh = await open(tmp, "wx");
        try {
          await fh.writeFile(bytes);
          await fh.sync();
        } finally {
          await fh.close();
        }
        await renameInto(tmp, file);
        return ok(ref);
      } catch (e) {
        // The write error is the one to report; a failed cleanup (EPERM on a held temp) must not replace it.
        await rm(tmp, { force: true }).catch(() => undefined);
        return err("unavailable", `blob: cannot write ${ref.sha256}`, { cause: e });
      }
    },
    async has(ref) {
      const p = pathOf(ref);
      if (!p.ok) return false;
      try {
        return (await sizeOf(p.value)) === ref.bytes;
      } catch {
        return false; // a stat error we cannot read is "not there", never a rejection
      }
    },
    async read(ref) {
      const p = pathOf(ref);
      if (!p.ok) return p;
      let bytes: Uint8Array;
      try {
        bytes = await readFile(p.value);
      } catch (e) {
        if (codeOf(e) === "ENOENT") return err("not-found", `blob: ${ref.sha256} is not in ${root}`);
        return err("unavailable", `blob: cannot read ${ref.sha256}`, { cause: e });
      }
      if (sha256(bytes) !== ref.sha256) return err("internal", `blob: ${ref.sha256} on disk does not hash to its name; the file is damaged`);
      return ok(bytes);
    },
  };
}
