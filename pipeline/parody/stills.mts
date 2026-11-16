// Reference stills for the robot-parody trailers' camera (operator 2026-11-11: "recreate the scene camera and
// environment composition into our world").
//
//   npx tsx pipeline/parody/stills.mts fetch <film> <film-grab page url>   -> <root>/<film>/NNN.jpg + sheet.jpg
//   npx tsx pipeline/parody/stills.mts sheet <film>                        -> rebuild the numbered contact sheet
//
// film-grab.com keeps ~60 curated stills per film, iconic frames among them (measured 2026-11-11: 9 of the 10 films
// listed; A Few Good Men is not, any folder of NNN.jpg works). The Director picks a still per shot from the sheet and
// writes it as the shot's `still` in shots.json; keys.mts turns it into a PLATE: grey, blurred past any face, so the
// frame borrows the camera, horizon, blocking and light and never the actor (measured on Terminator s1: with the
// plate the figure, lamp and negative space landed where the film has them; without it, a generic frontal crouch).
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

export const STILLS = path.resolve("foundry-out/parody-trailers/stills");

export const plate = async (still: string, to: string): Promise<string> => {
  if (!fs.existsSync(to)) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    await sharp(still).resize({ width: 1280 }).grayscale().blur(10).normalise().png().toFile(to);
  }
  return to;
};

const sheet = async (film: string): Promise<void> => {
  const dir = path.join(STILLS, film);
  const files = fs.readdirSync(dir).filter((f) => /^\d{3}\.jpg$/.test(f)).sort();
  const [w, h, cols] = [320, 180, 8];
  const tiles = await Promise.all(files.map(async (f, i) => {
    const img = await sharp(path.join(dir, f)).resize(w, h, { fit: "contain", background: "#000" }).toBuffer();
    const label = Buffer.from(`<svg width="${w}" height="${h}"><rect width="44" height="24" fill="#000"/><text x="4" y="18" font-size="18" font-family="sans-serif" fill="#ff0">${f.slice(0, 3)}</text></svg>`);
    return { input: await sharp(img).composite([{ input: label }]).toBuffer(), left: (i % cols) * w, top: Math.floor(i / cols) * h };
  }));
  await sharp({ create: { width: w * cols, height: h * Math.ceil(files.length / cols), channels: 3, background: "#000" } })
    .composite(tiles).jpeg({ quality: 80 }).toFile(path.join(dir, "sheet.jpg"));
  console.log(`${files.length} stills -> ${path.join(dir, "sheet.jpg")}`);
};

const fetchFilm = async (film: string, url: string): Promise<void> => {
  const ua = { "user-agent": "Mozilla/5.0" };
  const html = await (await fetch(url, { headers: ua })).text();
  const urls = [...new Set([...html.matchAll(/href="(https:\/\/film-grab\.com\/wp-content\/uploads\/photo-gallery\/[^"?]+)/g)].map((m) => m[1]!))];
  if (urls.length === 0) throw new Error(`no gallery stills on ${url}`);
  const dir = path.join(STILLS, film);
  fs.mkdirSync(dir, { recursive: true });
  for (const [i, u] of urls.entries()) {
    const to = path.join(dir, `${String(i + 1).padStart(3, "0")}.jpg`);
    if (fs.existsSync(to)) continue;
    const res = await fetch(u.replace(/ /g, "%20"), { headers: ua });
    if (!res.ok) { console.error(`${u}: ${res.status}`); continue; }
    fs.writeFileSync(to, Buffer.from(await res.arrayBuffer()));
  }
  await sheet(film);
};

if (process.argv[1]?.endsWith("stills.mts") === true) {
  const [verb, film, url] = process.argv.slice(2);
  if (verb === "fetch" && film !== undefined && url !== undefined) await fetchFilm(film, url);
  else if (verb === "sheet" && film !== undefined) await sheet(film);
  else { console.error("usage: stills.mts fetch <film> <film-grab url> | sheet <film>"); process.exit(2); }
}
