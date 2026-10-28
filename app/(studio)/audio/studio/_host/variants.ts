// The three competing layouts the studio switcher offers (spark audio-agent-studio, stage S1). Each
// builder replaces only its own folder under ../_v/; this table is the host's one reference to them.
import type { VariantId } from "../url.ts";
import { Variant as Canvas } from "../_v/canvas/Variant.tsx";
import { Variant as Desk } from "../_v/desk/Variant.tsx";
import { Variant as Stage } from "../_v/stage/Variant.tsx";
import type { Variant } from "./types.ts";

export const VARIANT_VIEWS: Readonly<Record<VariantId, Variant>> = { desk: Desk, canvas: Canvas, stage: Stage };
