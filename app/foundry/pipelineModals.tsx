// THE PIPELINE'S DIALOGS, as one door.
//
// This was 448 lines holding four unrelated conversations — a money confirm, a
// rework note, the item's own facts, and the write machinery all three share.
// They are four files under ./pipeline/modals/ now, and this stays as the door
// so every existing `from "./pipelineModals"` keeps working:
//
//   modals/write           the write, the receipt and the failure, shared
//   modals/DispatchConfirm the money gate
//   modals/ReworkNote      the instruction a rework requires
//   modals/ItemDetail      the facts, and the modal that mounts them

export { type Arm, type OfferedMove, type RunMove } from "./pipeline/modals/write";
export { DispatchConfirm } from "./pipeline/modals/DispatchConfirm";
export { ReworkNote } from "./pipeline/modals/ReworkNote";
export { DetailModal, ItemDetail } from "./pipeline/modals/ItemDetail";
