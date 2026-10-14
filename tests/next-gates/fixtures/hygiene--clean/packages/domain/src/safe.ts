export function f(v: unknown): number {
  try {
    return Number(v);
  } catch (e) {
    throw new Error("bad", { cause: e });
  }
}
export const cast = (v: unknown) => v as string;
export const mention = 'as unknown as any JSON.parse addEventListener("keydown"';
