// THIS MACHINE (spark device-metadata-sync, KS1) - the device every know-how record names as its owner. Minted once into
// the gitignored `.gravitone/device.json` ({id: "dev:<uuid>", name}) and read from there ever after, so a renamed host
// keeps its records: the id is the identity, the name only what a screen shows. GRAVITONE_DEVICE_FILE moves the file
// (tests); GRAVITONE_DEVICE_NAME names a fresh device instead of the lowercased hostname.

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Device } from "@gt/domain/knowhow";

const DEVICE_ID_RE = /^dev:[0-9a-f-]{36}$/;

/** `.gravitone/device.json` under the working directory, or GRAVITONE_DEVICE_FILE. Read per call. */
export function deviceFile(): string {
  const o = process.env["GRAVITONE_DEVICE_FILE"]?.trim();
  return o ? path.resolve(o) : path.join(process.cwd(), ".gravitone", "device.json");
}

function readDevice(file: string): Device | null {
  try {
    const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (typeof raw !== "object" || raw === null) return null;
    const r = raw as Record<string, unknown>;
    const id = r["id"];
    const name = r["name"];
    return typeof id === "string" && DEVICE_ID_RE.test(id) && typeof name === "string" && name.trim() !== "" ? { id, name } : null;
  } catch {
    return null;
  }
}

/** A name a public file may carry: lowercase letters, digits and dashes. */
const cleanName = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "device";

let cached: { readonly file: string; readonly device: Device } | null = null;

/** This machine's device: the file's, or a new one minted into it (temp file + rename, so a reader never sees half). */
export function thisDevice(): Device {
  const file = deviceFile();
  if (cached !== null && cached.file === file && existsSync(file)) return cached.device;
  const held = readDevice(file);
  if (held !== null) {
    cached = { file, device: held };
    return held;
  }
  const device: Device = { id: `dev:${randomUUID()}`, name: cleanName(process.env["GRAVITONE_DEVICE_NAME"] ?? os.hostname()) };
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(device, null, 1)}\n`);
  renameSync(tmp, file);
  cached = { file, device };
  return device;
}
