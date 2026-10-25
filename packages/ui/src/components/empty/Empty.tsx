// Nothing here, said in the work's words (tokens.css `.empty`): `no events match`, never a
// paragraph about what would be here. The label is held to the hint's twelve words by type,
// and the one act that fills the space renders at full strength beside it.
// NO role="status" (2026-10-25): a live region that arrives with its words is never announced
// (lib/announcer.tsx rule 1, the StaleBadge shape), so 65 resting empties were inert regions.
// A filter emptying a list is news; its owner says so through the announcer.
import { Button, type ButtonProps } from "../button/Button.tsx";
import type { TwelveWords } from "../hint/words.ts";
import s from "./Empty.module.css";

export type EmptyProps<S extends string> = { readonly label: S; readonly action?: ButtonProps } & TwelveWords<S>;

export function Empty<const S extends string>({ label, action }: EmptyProps<S>) {
  return (
    <div className={s.empty}>
      <span>{label}</span>
      {action !== undefined && <Button {...action} />}
    </div>
  );
}
