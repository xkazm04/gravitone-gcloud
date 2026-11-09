import "server-only";

// THE REAL SIDE of /scout/ventures: every venture head, oldest first; an imported venture's card read live from its channel file
// (the head's frame is what was imported, fixed at birth); its productions and their accepted lessons from the kernel.

import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import { ventureGroundOf, type Venture } from "@gt/domain/genre";
import { listProductions } from "@gt/kernel/productions/store";
import { acceptedLessons } from "@gt/kernel/productions/lessons";
import { operatorVentureIn } from "@gt/kernel/productions/venture";
import type { Store } from "@gt/kernel/store";
import { listVentures } from "@gt/kernel/ventures/store";

import { lookOf } from "../../../../../lib/foundry/scout/channelLook.ts";
import { readChannel } from "../../../../../lib/foundry/scout/channels.ts";
import { kernel } from "../../../../../lib/kernelStore.ts";

import type { VentureEntry, VenturesView } from "./contract.ts";
import type { ServerVentures } from "./port.ts";

async function channelOf(v: Venture): Promise<Pick<VentureEntry, "channel" | "channelProblem">> {
  if (v.channelId === undefined) return {};
  try {
    const f = await readChannel(v.channelId);
    const c = f.channel;
    const look = lookOf(c);
    return { channel: { id: c.id, group: c.group, name: c.name, audience: c.audience, promise: c.promise, gap: c.gap, edge: c.edge, medium: c.medium, ...(look === undefined ? {} : { look }) } };
  } catch (e) {
    return { channelProblem: `channel ${v.channelId} did not read: ${errorMessage(e)}` };
  }
}

async function buildView(store: Store): Promise<Result<VenturesView>> {
  const read = store.read((r) => ({ ventures: listVentures(r), productions: listProductions(r), lessons: acceptedLessons(r) }));
  if (!read.ok) return read;
  const { ventures, productions, lessons } = read.value;
  const entries: VentureEntry[] = [];
  for (const v of ventures) {
    const own = productions.filter((p) => p.ventureId === v.id);
    entries.push({
      id: v.id,
      name: v.name,
      kind: v.kind,
      ground: ventureGroundOf(v.proposal),
      proposal: v.proposal,
      frame: v.frame,
      bornAt: v.bornAt,
      ...(v.retiredAt === undefined ? {} : { retiredAt: v.retiredAt }),
      ...(v.channelId === undefined ? {} : { channelId: v.channelId }),
      ...(await channelOf(v)),
      productions: own.map((p) => ({ id: p.id as VentureEntry["productions"][number]["id"], title: p.title, stage: p.stage })),
      lessons: lessons.filter((l) => l.production.ventureId === v.id).map((l) => ({ id: `${l.production.id}/${l.lesson.id}`, dimension: l.lesson.dimension, text: l.lesson.text, production: l.production.title, drawnFrom: l.lesson.drawnFrom.length })),
    });
  }
  return ok({ ventures: entries });
}

const storeOf = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

export const realVentures: ServerVentures = {
  view: async () => {
    const s = storeOf();
    if (!s.ok) return s;
    try {
      return await buildView(s.value);
    } catch (e) {
      return err("unavailable", errorMessage(e));
    }
  },
  create: async (input, who) => {
    const s = storeOf();
    if (!s.ok) return s;
    const born = s.value.tx((t) => operatorVentureIn(t, input, who));
    if (!born.ok) return born;
    return buildView(s.value);
  },
};
