// Educational fact sheets for the 'how things work' strips.
//
// Every fact carries a quote, and this script FAILS unless each quote is found verbatim
// (after whitespace, entity and curly-quote normalisation) in the text it fetched from
// that fact's source, and is at most 25 words. Sources that refused programmatic access
// at build time (403 for UNESCO, Britannica, IWM) are not used; see each sheet's notes.
import { cachedText, cachedJSON, writeFixture, RETRIEVED } from "./_lib.mjs";

const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const ENT = { nbsp: " ", amp: "&", quot: '"', apos: "'", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', ndash: "–", mdash: "—", hellip: "…", eacute: "é", egrave: "è", ntilde: "ñ" };
function normalise(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const htmlText = (html) => normalise(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));

const SOURCES = {
  boe: { url: "https://www.bankofengland.co.uk/monetary-policy/the-interest-rate-bank-rate", publisher: "Bank of England" },
  fed: { url: "https://www.federalreserve.gov/faqs/money_12856.htm", publisher: "Board of Governors of the Federal Reserve System" },
  eiaChoke: { url: "https://www.eia.gov/international/content/analysis/special_topics/World_Oil_Transit_Chokepoints/", publisher: "U.S. Energy Information Administration (World Oil Transit Chokepoints, last updated March 3, 2026)" },
  eia586: { url: "https://www.eia.gov/pressroom/releases/press586.php", publisher: "U.S. EIA press release, April 7, 2026" },
  eia590: { url: "https://www.eia.gov/pressroom/releases/press590.php", publisher: "U.S. EIA press release, July 7, 2026" },
  pdg: { url: "https://pontdugard.fr/en/discover/history", publisher: "Pont du Gard site (official visitor site of the monument)" },
  wpPdg: { wiki: "Pont du Gard", publisher: "Wikipedia (CC BY-SA 4.0)" },
  noaa: { url: "https://www.noaa.gov/jetstream/doppler/how-radar-works", publisher: "NOAA JetStream (National Weather Service)" },
  wpRadar: { wiki: "Radar", publisher: "Wikipedia (CC BY-SA 4.0)" },
  bawdsey: { url: "https://www.bawdseyradar.org.uk/history/", publisher: "Bawdsey Radar (museum at the first operational radar station)" },
  wpChainHome: { wiki: "Chain Home", publisher: "Wikipedia (CC BY-SA 4.0)" },
};

const texts = {};
async function sourceText(key) {
  if (texts[key]) return texts[key];
  const s = SOURCES[key];
  if (s.wiki) {
    const api = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts|revisions&rvprop=ids&explaintext=1&titles=${encodeURIComponent(s.wiki)}&format=json&formatversion=2&redirects=1`;
    const j = await cachedJSON(api, `edu/wiki-${s.wiki.replace(/\W+/g, "_")}.json`);
    const pg = j.query.pages[0];
    s.url = `https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(pg.title.replace(/ /g, "_"))}&oldid=${pg.revisions[0].revid}`;
    texts[key] = normalise(pg.extract);
  } else {
    texts[key] = htmlText(await cachedText(s.url, `edu/${key}.html`, { ua: BROWSER }));
  }
  return texts[key];
}

async function fact(text, key, quote) {
  const hay = await sourceText(key);
  const q = normalise(quote);
  const words = q.split(" ").length;
  if (words > 25) throw new Error(`quote over 25 words (${words}): ${q}`);
  if (!hay.includes(q)) throw new Error(`quote NOT FOUND in ${SOURCES[key].url}: ${q}`);
  return { text, source: SOURCES[key].url, publisher: SOURCES[key].publisher, quote: q };
}

const sheets = [
  {
    case: "edu-rate-hike",
    title: "How a rate rise cools inflation",
    beat: "A central bank raises its policy rate, borrowing gets dearer, spending falls, and prices rise more slowly.",
    steps: [
      "The central bank raises its policy rate",
      "Banks charge more on loans and mortgages",
      "Households and firms borrow and spend less",
      "Demand for goods and services falls",
      "Prices rise more slowly: inflation falls",
    ],
    facts: [
      await fact("A higher Bank Rate usually means dearer bank loans", "boe", "when we raise the Bank Rate, banks will usually increase how much they charge their customers on loans and the interest they offer on savings"),
      await fact("Higher rates raise mortgage and loan payments", "boe", "Higher interest rates mean higher payments on many mortgages and loans, meaning people must spend more on them and less on other things."),
      await fact("Less spending, slower price rises", "boe", "When customers spend less, businesses are less willing or able to raise their prices. When prices don't go up so quickly, inflation falls."),
      await fact("The effect is neither direct nor immediate", "fed", "while the linkages from monetary policy to both inflation and employment are not direct or immediate, monetary policy is an important factor"),
    ],
    countable: [
      "exactly one policy-rate indicator, moving UP once at the start",
      "five stages shown in the order of `steps`, left to right or top to bottom",
      "the price line keeps rising but with a shallower slope at the end (inflation falls, prices do not fall)",
      "a visible delay between the rate rise and the price slowdown (not instantaneous)",
    ],
    notes: "Bank of England page last updated 18 September 2026; Federal Reserve FAQ last updated July 19, 2024 (dates as printed on the pages).",
  },
  {
    case: "edu-chokepoint",
    title: "Why one strait can move the oil price",
    beat: "Most oil leaving the Persian Gulf must squeeze through the narrow Strait of Hormuz, so blocking it removes supply that pipelines cannot replace, and world prices jump.",
    steps: [
      "Gulf producers load tankers inside the Persian Gulf",
      "All sea exports funnel through the Strait of Hormuz, between Oman and Iran",
      "Bypass pipelines can carry only part of that flow",
      "If the strait is blocked, supply to world markets drops",
      "World oil prices rise",
    ],
    facts: [
      await fact("About 20.9 million barrels a day passed Hormuz in early 2025, about 20% of world use", "eiaChoke", "In 1H25, total oil flows through the strait averaged 20.9 million b/d, or the equivalent of about 20% of global petroleum liquids consumption"),
      await fact("Bypass pipelines: about 4.7 million barrels a day", "eiaChoke", "Saudi Aramco's East-West crude oil pipeline and the UAE's Abu Dhabi pipeline together could provide about 4.7 million b/d of capacity to bypass the strait"),
      await fact("2026: the strait closed, a first in the EIA's experience", "eia586", "just as we had never before seen the strait close, we've never seen it reopen"),
      await fact("Brent: $85 a barrel in June 2026, $32 below its April peak", "eia590", "The Brent crude oil spot price averaged $85 per barrel (b) in June, down $22/b from May and $32/b from the April 2026 peak."),
    ],
    countable: [
      "exactly one narrow strait, with Oman on one side and Iran on the other",
      "one main sea lane out of the Persian Gulf; tankers pass through it single file",
      "bypass pipeline(s) drawn clearly thinner than the sea lane (4.7 vs 20.9 million b/d, under a quarter)",
      "one price line that rises after the blockage",
    ],
    notes: "Flow figure is first-half 2025 from EIA's chokepoints report (Table 1: Hormuz 20.7 million b/d in 2024, 20.9 in 1H25). EIA's earlier June 16, 2025 Today in Energy note gave 20 million b/d for 2024; the March 2026 report revises that to 20.7, so use the 1H25 figure. The 2026 closure facts come from EIA STEO press releases; the April peak price itself is not stated, only the $32/b drop to June.",
  },
  {
    case: "edu-aqueduct",
    title: "How a Roman aqueduct crossed a valley",
    beat: "Gravity alone carries spring water 50 km to Nîmes down a very slight slope, about 25 cm per km on average, and a three-tier bridge, the Pont du Gard, keeps the channel high enough to cross the Gardon valley.",
    steps: [
      "Spring water enters the channel near Uzès",
      "The channel drops very gently, about 25 cm per km on average",
      "At the Gardon valley a three-tier bridge carries the channel across, 49 m high",
      "The water keeps flowing downhill by gravity to Nîmes, with no pumps",
    ],
    facts: [
      await fact("Average slope: 25 cm per kilometre", "pdg", "With an average gradient of 25 cm per kilometre, one of the lowest ever achieved at the time"),
      await fact("50 km from Uzès to Nîmes, by gravity alone", "pdg", "carried 30,000 to 40,000 m3 of running water per day by gravity from a spring in Uzès, over a distance of 50 kilometres"),
      await fact("Pont du Gard: 49 m high", "pdg", "At 49 metres high, the Pont du Gard is the highest Roman aqueduct bridge in the world."),
      await fact("The slope is not constant along the route", "wpPdg", "It varies widely along its course, but is as little as 1 in 20,000 in some sections."),
    ],
    countable: [
      `exactly three tiers of arches on the bridge (official site: "${(await fact("", "pdg", "It is the only example of an ancient 3-storey bridge still standing today.")).quote}")`,
      "water flows one way only, from the spring toward Nîmes; no pumps or wheels",
      "the water rides in the covered channel on TOP of the bridge, not in the river below",
      "if the slope is drawn visibly, it is labelled as exaggerated (25 cm per km is invisible to the eye)",
    ],
    notes: "The brief asked for a 'constant' gradient: the sources contradict that. Wikipedia (Pont du Gard) says the gradient 'varies widely along its course', so the beat says 'average'. Total drop is left OFF on purpose: Wikipedia says the spring is 17 m higher than the Nîmes basin, while the official 25 cm/km over 50 km implies about 12.5 m, and Wikipedia's own average '1 in 3,000' (about 33 cm/km) disagrees with the official 25 cm/km. UNESCO (whc.unesco.org/en/list/344) and Britannica returned HTTP 403 to scripted fetches, so they could not be quote-verified.",
  },
  {
    case: "edu-radar",
    title: "How radar measures distance",
    beat: "Radar sends a short radio pulse at the speed of light, times how long the echo takes to come back, and halves the round trip: distance = c × t ÷ 2.",
    steps: [
      "The transmitter sends a short radio pulse",
      "The pulse travels at the speed of light and hits the aircraft",
      "A weak echo reflects back to the receiver",
      "The receiver times the round trip, t",
      "Distance = speed of light × t ÷ 2",
    ],
    facts: [
      await fact("Radar pulses travel at the speed of light", "noaa", "Radar pulses are transmitted away from the radar at the speed of light, but they are very short in duration."),
      await fact("Distance = c × t ÷ 2", "wpRadar", "The distance is one-half the round trip time multiplied by the speed of the signal."),
      await fact("1937: Bawdsey, the first fully operational radar station", "bawdsey", "On 24th September 1937, RAF Bawdsey became the first fully operational Radar station in the world."),
      await fact("September 1939: 21 Chain Home stations in operation", "wpChainHome", "By the outbreak of war in September 1939, there were 21 operational Chain Home stations."),
    ],
    countable: [
      "one aircraft, one transmitter/receiver site",
      "exactly two paths per cycle: the pulse out and the echo back",
      "the echo drawn weaker (smaller or fainter) than the outgoing pulse",
      "the formula shows the ÷ 2 explicitly",
    ],
    notes: "Britannica, the IWM and the Science Museum Group returned HTTP 403 to scripted fetches, so the Chain Home station count is quoted from Wikipedia and the 1937 first is quoted from the Bawdsey Radar museum site.",
  },
];

for (const s of sheets) {
  const f = writeFixture(s.case, { ...s, retrieved: RETRIEVED });
  console.log(`wrote ${f}: ${s.facts.length} facts verified`);
}
