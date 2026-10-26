import { hasModel, OLLAMA_UP, ollamaTags, ollamaTextModel, type OllamaFetch } from "../../text/providers/ollama";
import type { Check } from "./doctor";

// THE LOCAL MODEL'S LINE in the night's preflight (spark scout-vision S6): the Ollama
// daemon at OLLAMA_HOST, whether it answers, and whether it holds the text model the
// night's drafts ask for (lib/text/providers/ollama.ts). ALWAYS a note, never a
// failure: without it a draft is written by the claude CLI behind it and the eye reads
// with Gemini, so the night loses money, not a step. One free local GET (/api/tags),
// and none at all when OLLAMA_HOST is unset - a box that runs no daemon is asked nothing.

const REMEDY_UP = `${OLLAMA_UP} starts it; set OLLAMA_HOST=http://127.0.0.1:11434 (pipeline/scout-schedule.ps1 does both)`;

export async function ollamaCheck(env: Readonly<Record<string, string | undefined>>, f?: OllamaFetch): Promise<Check> {
  const host = env["OLLAMA_HOST"]?.trim() ?? "";
  const model = ollamaTextModel(env);
  if (host === "") return { name: "ollama", ok: false, found: "OLLAMA_HOST unset: drafts fall to the claude CLI, the eye to Gemini", remedy: REMEDY_UP, needed: false };
  let tags: string[];
  try {
    tags = await ollamaTags(host, f);
  } catch (e) {
    return { name: "ollama", ok: false, found: `${host} · daemon did not answer /api/tags: ${(e as Error).message}`, remedy: REMEDY_UP, needed: false };
  }
  if (!hasModel(tags, model)) return { name: "ollama", ok: false, found: `${host} · daemon up · ${model} not pulled`, remedy: `ollama pull ${model}, or set OLLAMA_TEXT_MODEL to one of: ${tags.join(", ") || "none"}`, needed: false };
  return { name: "ollama", ok: true, found: `${host} · daemon up · ${model} present`, needed: false };
}
