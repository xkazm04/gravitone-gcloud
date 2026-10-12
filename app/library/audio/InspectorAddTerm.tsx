"use client";

// THE ADD-TERM FIELD — the text input the Composer uses to add a term to a seed
// list or to the exclude list. Self-contained: it takes its list id, label and
// placeholder as props and commits through onAdd. Split out of
// InspectorComposer.tsx to keep each Inspector file under the 200-line cap.

/** A text field that adds its value to a seed list on change (Enter or blur),
 *  then clears — the entry's `change` listener. Uncontrolled on purpose: what
 *  is typed is not state until it is committed. */
export function AddTerm({
  list,
  label,
  placeholder,
  onAdd,
}: {
  list: string;
  label: string;
  placeholder: string;
  onAdd: (v: string) => void;
}) {
  return (
    <input
      className="addterm"
      list={list}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => {
        // A pick from the datalist arrives as one change with no keystroke
        // after it; commit it straight away, as the entry's `change` did.
        const native = e.nativeEvent as InputEvent;
        if (native.inputType === "insertReplacementText") {
          const v = e.currentTarget.value.trim();
          if (v) {
            onAdd(v);
            e.currentTarget.value = "";
          }
        }
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const v = e.currentTarget.value.trim();
        if (v) onAdd(v);
        e.currentTarget.value = "";
      }}
      onBlur={(e) => {
        const v = e.currentTarget.value.trim();
        if (v) onAdd(v);
        e.currentTarget.value = "";
      }}
    />
  );
}
