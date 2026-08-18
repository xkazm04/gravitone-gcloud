// Shared fixtures for the golden-path dynamic probes.
import { PHASES, type PhaseKey, type PhaseState, type Project } from "@/lib/projects";

const allEmpty = (): Record<PhaseKey, PhaseState> =>
  Object.fromEntries(PHASES.map((p) => [p, "empty"])) as Record<PhaseKey, PhaseState>;

/** A valid Project with the fields ProjectsMatrix actually reads. */
export function mkProject(
  id: string,
  updatedAt: number,
  progress: Partial<Record<PhaseKey, PhaseState>> = {},
): Project {
  return {
    id,
    uid: "u1",
    title: `Project ${id}`,
    logline: "",
    template: "explainer" as Project["template"],
    targetS: 90,
    createdAt: updatedAt - 10_000,
    updatedAt,
    phase: "research",
    progress: { ...allEmpty(), ...progress },
  } as Project;
}

/** Walk a Playwright/React element tree, counting elements and collecting testids. */
export function walkTree(node: unknown, acc: { n: number; testids: string[]; handlers: unknown[] }) {
  if (node == null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const c of node) walkTree(c, acc);
    return;
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (el.type !== undefined && el.props !== undefined) {
    acc.n++;
    const tid = el.props["data-testid"];
    if (typeof tid === "string") acc.testids.push(tid);
    if (typeof el.props.onClick === "function") acc.handlers.push(el.props.onClick);
    walkTree(el.props.children, acc);
  }
}

export const noopProps = {
  onOpen: () => {},
  onEdit: () => {},
  onDelete: () => {},
  onCreate: () => {},
};
