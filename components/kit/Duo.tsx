// AN A/B PAIR: baseline beside challenger, seed-matched, and the judge's pick
// marked on the arm it chose with a gold ✦ PICK. Beneath: the judge's reason, and,
// if a second judge disagrees, its words quoted. An arm whose file was deleted at
// commit says so; the record stays.

export interface DuoArm {
  /** Absent when the file was deleted. */
  src?: string;
  alt: string;
  name: "baseline" | "challenger";
  picked: boolean;
  video?: boolean;
}

export function Duo({
  scene,
  seed,
  arms,
  judge,
  dissent,
}: {
  scene: string;
  seed: number | string;
  arms: [DuoArm, DuoArm];
  /** The judge's pick and the reason it gave. A tie is drawn quiet, a pick in gold. */
  judge: { pick: string; reason: string };
  /** A second judge who disagreed, quoted. */
  dissent?: { who: string; pick: string; reason?: string };
}) {
  return (
    <div className="k-duo">
      <div className="k-duo__h">
        <span className="truncate">{scene}</span>
        <span className="shrink-0">seed {seed}</span>
      </div>
      <div className="k-arms">
        {arms.map((a) => (
          <div key={a.name} className={`k-arm${a.picked ? " k-arm--pk" : ""}`}>
            {a.src ? (
              // eslint-disable-next-line @next/next/no-img-element -- local disk through the file seam
              <img src={a.src} alt={a.alt} loading="lazy" />
            ) : (
              <span className="k-arm__gone k-caps">culled</span>
            )}
            <span className="k-arm__al">{a.name}</span>
            {a.video && <span className="k-arm__vid">video · poster</span>}
            {a.picked && (
              <span className="k-arm__pk">
                <span aria-hidden="true">✦ </span>PICK
              </span>
            )}
          </div>
        ))}
      </div>
      <p>
        <span className={judge.pick === "tie" ? "k-tie" : "k-j"}>judge: {judge.pick}</span> — {judge.reason}
      </p>
      {dissent && (
        <p className="k-dis">
          {dissent.who} disagrees: {dissent.pick}
          {dissent.reason ? ` — ${dissent.reason}` : ""}
        </p>
      )}
    </div>
  );
}
