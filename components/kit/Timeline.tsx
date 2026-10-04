"use client";

// A TIMELINE: tracks stacked against one ruler, every clip a block to scale, the
// cues of the piece as marks on the ruler, the playhead one gold rule through it all.
//
// The drawing is the state:
//
//   placed   a solid ruled block at its mark
//   drift    a gold-edged block drawn where it actually sits, and a dashed outline
//            left at its mark: an offset is a distance, and a distance has two ends
//   missing  a dashed block with nothing in it: drawn, not hidden
//
// Times are seconds; a clip's `offset` is milliseconds of drift from its mark. The
// timeline holds no state. Selection and the playhead belong to the caller, and a
// clip is a button only when `onSelect` is given. It scrolls sideways at a fixed
// scale (`pxPerSecond`) rather than squeezing a long cut into a phone, and the track
// names stay put while it does.

export type ClipState = "placed" | "drift" | "missing";

export interface TimelineClip {
  id: string;
  label: string;
  /** Seconds: where the clip is meant to start. */
  start: number;
  /** Seconds. */
  dur: number;
  state?: ClipState;
  /** Milliseconds of drift from `start`. Drawn only on a `drift` clip. */
  offset?: number;
}

export interface TimelineTrack {
  id: string;
  label: string;
  clips: readonly TimelineClip[];
}

export interface TimelineCue {
  /** Seconds. */
  at: number;
  label: string;
}

const STATE_WORD: Record<ClipState, string> = { placed: "placed", drift: "drift", missing: "missing" };

const f1 = (n: number) => (Math.round(n * 10) / 10).toString();

export function Timeline({
  label,
  duration,
  tracks,
  cues,
  playhead,
  selectedId,
  tick,
  pxPerSecond = 26,
  onSelect,
}: {
  /** The timeline's accessible name: "Cut, 60 seconds". */
  label: string;
  /** Seconds. */
  duration: number;
  tracks: readonly TimelineTrack[];
  cues?: readonly TimelineCue[];
  /** Seconds. Omit to draw no playhead. */
  playhead?: number;
  selectedId?: string | null;
  /** Seconds between ruler ticks. Defaults to a round step that keeps ticks apart. */
  tick?: number;
  pxPerSecond?: number;
  onSelect?: (id: string) => void;
}) {
  const step = tick ?? [1, 2, 5, 10, 15, 30, 60].find((s) => s * pxPerSecond >= 72) ?? 60;
  const ticks: number[] = [];
  for (let t = 0; t <= duration + 1e-6; t += step) ticks.push(t);
  const pct = (s: number) => `${Math.min(100, Math.max(0, (s / duration) * 100))}%`;
  const width = Math.max(320, Math.round(duration * pxPerSecond));

  const all = tracks.flatMap((t) => t.clips);
  const count = (s: ClipState) => all.filter((c) => (c.state ?? "placed") === s).length;

  return (
    <figure className="k-tl" aria-label={label}>
      <div className="k-tl__scroll">
        <div className="k-tl__in" style={{ width: `calc(var(--k-tl-gut) + ${width}px)` }}>
          {cues && cues.length > 0 && (
            <div className="k-tl__row k-tl__row--cues">
              <span className="k-tl__gut k-caps" />
              <div className="k-tl__lane k-tl__lane--cues">
                {cues.map((c) => (
                  <span key={`${c.at}-${c.label}`} className="k-tl__cue" style={{ left: pct(c.at) }}>
                    <i aria-hidden="true" />
                    <span className="k-tl__cuel">
                      {f1(c.at)}s · {c.label}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="k-tl__row">
            <span className="k-tl__gut k-caps" />
            <div className="k-tl__lane k-tl__ruler" aria-hidden="true">
              {ticks.map((t) => (
                <span key={t} className="k-tl__tick" style={{ left: pct(t) }}>
                  <span className="k-num">{t}s</span>
                </span>
              ))}
            </div>
          </div>

          {tracks.map((tr) => (
            <div key={tr.id} className="k-tl__row" role="group" aria-label={`${tr.label} track`}>
              <span className="k-tl__gut k-caps">{tr.label}</span>
              <div className="k-tl__lane k-tl__track">
                {tr.clips.map((c) => {
                  const state = c.state ?? "placed";
                  const drift = state === "drift" ? (c.offset ?? 0) / 1000 : 0;
                  const from = c.start + drift;
                  const name = `${c.label}, ${f1(from)}s to ${f1(from + c.dur)}s, ${STATE_WORD[state]}${
                    state === "drift" && c.offset ? `, ${c.offset > 0 ? "+" : ""}${c.offset}ms` : ""
                  }`;
                  const style = { left: pct(from), width: `${Math.max(0.4, (c.dur / duration) * 100)}%` };
                  const cls = `k-clip k-clip--${state}${c.id === selectedId ? " is-on" : ""}`;
                  return (
                    <span key={c.id} className="k-clip__slot">
                      {drift !== 0 && (
                        <span
                          aria-hidden="true"
                          className="k-clip__mark"
                          style={{ left: pct(c.start), width: `${Math.max(0.4, (c.dur / duration) * 100)}%` }}
                        />
                      )}
                      {onSelect ? (
                        <button
                          type="button"
                          className={cls}
                          style={style}
                          aria-label={name}
                          aria-pressed={c.id === selectedId}
                          onClick={() => onSelect(c.id)}
                        >
                          <span>{c.label}</span>
                        </button>
                      ) : (
                        <span role="img" className={cls} style={style} aria-label={name}>
                          <span aria-hidden="true">{c.label}</span>
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}

          {playhead !== undefined && (
            <div className="k-tl__phwrap" aria-hidden="true">
              <span className="k-tl__gut" />
              <div className="k-tl__phlane">
                <span className="k-tl__ph" style={{ left: pct(playhead) }}>
                  <i />
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      <figcaption className="k-tl__key">
        <span className="k-tl__k k-tl__k--placed">
          <i aria-hidden="true" />
          <span className="k-caps">placed</span>
          <b className="k-num">{count("placed")}</b>
        </span>
        <span className="k-tl__k k-tl__k--drift">
          <i aria-hidden="true" />
          <span className="k-caps">drift</span>
          <b className="k-num">{count("drift")}</b>
        </span>
        <span className="k-tl__k k-tl__k--missing">
          <i aria-hidden="true" />
          <span className="k-caps">missing</span>
          <b className="k-num">
            {count("missing")} of {all.length}
          </b>
        </span>
      </figcaption>
    </figure>
  );
}
