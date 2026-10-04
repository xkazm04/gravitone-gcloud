// THE SKY — a fixed field of faint stars and a graticule, behind the page.
// Deterministic (a seeded generator), so server and client draw the same stars.
// Decorative: aria-hidden, and it takes no pointer events.

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 1600;
const H = 1000;

function build() {
  const rnd = mulberry(5);
  const rings: number[] = [];
  for (let r = 1700; r < 3000; r += 110) rings.push(r);
  const rays: string[] = [];
  for (let a = 60; a <= 120; a += 5) {
    const ra = (a * Math.PI) / 180;
    rays.push(
      `M ${(800 + 1600 * Math.cos(ra)).toFixed(1)} ${(-1500 + 1600 * Math.sin(ra)).toFixed(1)} L ${(800 + 3100 * Math.cos(ra)).toFixed(1)} ${(-1500 + 3100 * Math.sin(ra)).toFixed(1)}`,
    );
  }
  const stars = Array.from({ length: 170 }, () => {
    const m = Math.pow(rnd(), 5);
    return {
      x: (rnd() * W).toFixed(1),
      y: (rnd() * H * 0.55).toFixed(1),
      r: (0.4 + m * 1.4).toFixed(2),
      o: (0.12 + rnd() * 0.25 + m * 0.4).toFixed(2),
    };
  });
  return { rings, rays, stars };
}

const SKY = build();

export function Sky() {
  return (
    <div className="k-sky" aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMin slice">
        <g fill="none" style={{ stroke: "var(--al-ash)", strokeOpacity: 0.09 }}>
          {SKY.rings.map((r) => (
            <circle key={r} cx="800" cy="-1500" r={r} />
          ))}
          {SKY.rays.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        <g style={{ fill: "var(--al-white)" }}>
          {SKY.stars.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} fillOpacity={s.o} />
          ))}
        </g>
      </svg>
    </div>
  );
}
