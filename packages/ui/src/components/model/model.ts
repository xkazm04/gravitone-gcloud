// The 3D viewer's two shared shapes, apart from both components so the lazy stage
// (./ModelStage.tsx) and the shell that loads it (./ModelViewer.tsx) do not import each other.

export type ModelLoad =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly tris: number; readonly bones: number }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "no-webgl" };

/** Colours the stage paints with, read from the tokens on the viewer's own element. */
export type StageInk = { readonly bone: string; readonly light: string; readonly ground: string };

/** The stage's colours as the viewer's tokens resolve them on `el` (ModelViewer.module.css). */
export function inkOf(el: Element): StageInk {
  const cs = getComputedStyle(el);
  const v = (name: string): string => cs.getPropertyValue(name).trim();
  return { bone: v("--model-bone"), light: v("--model-light"), ground: v("--model-ground") };
}
