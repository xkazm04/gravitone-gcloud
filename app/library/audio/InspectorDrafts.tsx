"use client";

// THE DRAFTS — the Inspector's "Drafts" block: every copied prompt, with a drop
// zone for the file it returned. Split out of Inspector.tsx to keep each
// Inspector file under the 200-line cap.

import { Dropzone } from "@/components/kit";

import { OPENED_AT, ago, returnsOf, type Draft, type Take } from "./book";
import { refById } from "./audioRefs";

/* ── drafts ────────────────────────────────────────────────────────────── */

export function Drafts({
  drafts,
  takes,
  byId,
  onOpen,
  onAttach,
}: {
  drafts: readonly Draft[];
  takes: readonly Take[];
  byId: ReadonlyMap<string, Take>;
  onOpen: (id: string) => void;
  onAttach: (file: File, draftId: string) => void;
}) {
  const awaiting = drafts.filter((d) => returnsOf(d.id, takes).length === 0).length;
  return (
    <section className="panel" aria-label="Drafts">
      <h3>
        Drafts{" "}
        <span className="tally">
          <b>{awaiting}</b>
          <small>awaiting</small>
        </span>
        <span className="tally">
          <b>{drafts.length}</b>
          <small>sent</small>
        </span>
      </h3>
      <div className="drafts">
        {drafts.slice(0, 8).map((d) => {
          const rets = returnsOf(d.id, takes);
          const par = d.parent_id ? byId.get(d.parent_id) : undefined;
          const ref = refById(d.ref_id);
          return (
            <div key={d.id} className={`draft${rets.length ? "" : " await"}`}>
              <div className="draft__h">
                <span className="chip">{d.target}</span>
                {rets.length ? (
                  <span className="tally t-kept">
                    <b>{rets.length}</b>
                    <small>returned</small>
                  </span>
                ) : (
                  <span className="await-chip">awaiting return</span>
                )}
                {par ? (
                  <button type="button" className="chip" onClick={() => onOpen(par.id)}>
                    ↑ {par.title}
                  </button>
                ) : ref ? (
                  <span className="chip chip--ref">ref·{ref.title}</span>
                ) : null}
                <span className="dim">{ago(d.created_at, OPENED_AT)}</span>
                {rets.map((r) => (
                  <button key={r.id} type="button" className="chip chip--ret" onClick={() => onOpen(r.id)}>
                    {r.title}
                  </button>
                ))}
              </div>
              <div className="draft__t">{d.text.replace(/\n+/g, " · ")}</div>
              <Dropzone
                accept="audio/*"
                constraints="the file you downloaded · mp3 · wav · m4a"
                label={`Attach the returned file to the ${d.target} draft`}
                onFiles={(files) => {
                  const f = files[0];
                  if (f) onAttach(f, d.id);
                }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
