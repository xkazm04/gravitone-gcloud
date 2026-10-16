// GET|HEAD /api/blob/<sha256>[?type=<mime>] - THE KERNEL'S BLOBS, BY THEIR ADDRESS.
//
// Plates, takes, clips and exports are content-addressed in the kernel's blob store
// (@gt/kernel/blob, `sha256:<digest>` on the cut timeline, `plate.blob` on a frames unit) and
// nothing served them: v1 kept the bytes inside its records as data: URLs (frames ~5 MB a cut,
// alternatives ~1.5 MB a scene, INVENTORY §7.7) or behind one route per store. One route here,
// through the one ranged file server (app/_server/serveFile.ts: Range, If-Range, ETag, HEAD,
// streamed), so a <video> seeks a clip and an <img> draws a plate from its ref alone.
//
// ACCESS-GUARDED (`access`: the session cookie, or a read-scope CLI token) - a digest is not a
// secret, a principal is. The address IS the content, so the answer never changes under its
// name: `immutable`, held a year.
//
// THE TYPE: a blob file carries no mime (the ref does - the same bytes under two mimes are one
// file), so the caller names it with `type`, from the ref it holds. Only MEDIA types are served
// as themselves; anything else (text/html, an SVG, a script) answers as an octet stream with
// `nosniff`, so a blob can never become a page on this origin.

import { z } from "zod";

import { sha256Schema } from "@gt/domain/blob";
import { err } from "@gt/domain/errors";
import { blobStore } from "@gt/kernel/blob";

import { blobRootOf } from "../../../../lib/parts/gates.ts";
import { kernel } from "../../../../lib/kernelStore.ts";
import { route } from "../../../_server/route.ts";
import { serveFile } from "../../../_server/serveFile.ts";

export const maxDuration = 60;

const MEDIA = /^(image\/(png|jpeg|webp|gif|avif)|audio\/(wav|x-wav|mpeg|mp4|ogg|flac|webm)|video\/(mp4|webm)|application\/json)$/;

/** The type a blob is served as: the caller's, when it is a media type; never one that renders as a page. */
const servedType = (asked: string | undefined): string => (asked !== undefined && MEDIA.test(asked) ? asked : "application/octet-stream");

const input = z.object({ type: z.string().max(80).optional() }).strict();

const handler = route({ guard: "access", bodyCap: 0, maxDuration, input }, async ({ req, input: q, params }) => {
  const raw = (await params)["sha"];
  const sha = sha256Schema.safeParse(typeof raw === "string" ? raw : "");
  if (!sha.success) return err("invalid", "a blob is addressed by its sha256 (64 lowercase hex)");
  const k = kernel();
  if (!k.ok) return k;
  const type = servedType(q.type);
  const at = blobStore(blobRootOf(k.value.store)).pathOf({ sha256: sha.data, bytes: 0, mime: type });
  if (!at.ok) return at;
  const res = await serveFile(req, at.value, { mime: type, cache: "private, max-age=31536000, immutable" });
  res.headers.set("x-content-type-options", "nosniff");
  return res;
});

export const GET = handler;
export const HEAD = handler;
