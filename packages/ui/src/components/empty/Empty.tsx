// Nothing here, said in the work's words (tokens.css `.empty`): `no events match`, never a
// paragraph about what would be here. The label is held to the hint's twelve words by type,
// and the one act that fills the space renders at full strength beside it.
import { Button, type ButtonProps } from "../button/Button.tsx";
import type { TwelveWords } from "../hint/words.ts";
import s from "./Empty.module.css";

export type EmptyProps<S extends string> = { readonly label: S; readonly action?: ButtonProps } & TwelveWords<S>;

export function Empty<const S extends string>({ label, action }: EmptyProps<S>) {
  return (
    <div className={s.empty} role="status">
      <span>{label}</span>
      {action !== undefined && <Button {...action} />}
    </div>
  );
}
