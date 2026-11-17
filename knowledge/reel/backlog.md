# Reel backlog

Ideas for `/reel`. Each passed the continuity gate **on paper**: the step counts, lead changes and licences
below were written from memory on 2026-11-17 and are unverified until `pipeline/reel.mts data` has measured
the real table and the source's terms have been read. The gate (registry `data-video-virality`,
`continuity-gate`): about 60 real steps, five entities on screen, two lead changes, fifteen overtakes, 5 to
15 dated events.

A measured line is added under an idea when a table for it has been through `data`.

## Open data, passes on paper

| # | Reel | Steps | What moves | Source and licence to confirm |
|---|---|---|---|---|
| 1 | Most-viewed person on Wikipedia, day by day, 2015-2026 | ~4,000 daily | The leader changes constantly; deaths, elections and finals are the event cards | Wikimedia pageviews API (CC0) |
| 2 | US electricity by source, monthly, 1973-2026 | ~640 | Gas passes coal, wind passes hydro, solar climbs from zero | EIA (US public domain) |
| 3 | Orbital launches by country and company, launch by launch, 1957-2026 | ~6,800 events | USSR and USA trade the lead; SpaceX goes from nothing to first | GCAT (CC BY) |
| 4 | F1 all-time wins, race by race, 1950-2026 | ~1,150 | Fangio, Clark, Stewart, Prost, Schumacher, Hamilton | f1db (CC BY 4.0) for a published cut |
| 5 | Premier League all-time table, matchday by matchday, 1992-2026 | ~1,300 | The chase under Man Utd; Man City's climb | openfootball (public domain) |
| 6 | US airlines by monthly passengers, 1990-2026 | ~430 | Mergers, Southwest's rise, the 2020 collapse and recovery | BTS T-100 (US public domain) |
| 7 | Stack Overflow questions per language, monthly, 2008-2026 | ~215 | Python passes Java and JavaScript, then every bar falls after Nov 2022 | Stack Exchange dump (CC BY-SA) |
| 8 | US baby names, yearly, 1880-2025 | 145 yearly | Constant turnover in the top 10; passes only on the long-series rule | SSA (US public domain) |
| 9 | GitHub stars of AI projects, daily, 2022-2026 | ~1,400 | Spikes and overtakes among projects that did not exist a year earlier | GH Archive |
| 10 | Windows versions' share, monthly, 2009-2026 | ~200 | XP, 7, 10, 11 crossing; a share stream, not a race | StatCounter (CC BY-SA) |

**4, measured 2026-11-17** (`foundry-out/reels/f1-wins`, Jolpica-F1 cache, 1950-2025): 1,149 race steps, 40
entities, 10 on screen, 8 lead changes (Farina, Fangio, Ascari, Fangio, Clark 1968, Stewart 1973, Prost
1987, Schumacher 2001, Hamilton 2020), 96 overtakes, 12 events. Passes. Jolpica's terms were not confirmed
for commercial use, so that table is a proof only; a published cut rebuilds it from f1db.

## Passes on paper, source terms to check first

| # | Reel | Steps | What moves | Source to verify |
|---|---|---|---|---|
| 11 | Europe's top 10 clubs by Elo rating, daily, 1960-2026 | thousands | Real, Milan, Barcelona, Bayern and City trade the lead | clubelo.com |
| 12 | FIFA men's ranking top 10, monthly, 1993-2026 | ~390 | Brazil, France, Spain, Germany, Belgium, Argentina | FIFA tables via Wikipedia |
| 13 | The race for second place behind Bitcoin, daily, 2013-2026 | ~4,700 | XRP, Ethereum, Dogecoin, Terra's collapse | CoinGecko |
| 14 | Steam's most-played games, monthly peaks, 2012-2026 | ~170 | Dota 2 and CS; PUBG in 2017; Palworld | SteamCharts / SteamDB |
| 15 | Best language model by lab, weekly, 2023-2026 | ~180 | Frequent lead changes between labs; DeepSeek's arrival | LMArena history |
| 16 | NBA all-time points, game by game, 1946-2026 | thousands | Wilt, Kareem, LeBron | balldontlie |
| 17 | Weeks at world No. 1 in men's tennis, weekly, 1973-2026 | ~2,700 | Connors, Lendl, Sampras, Federer, Djokovic | Wikipedia tables (the usual dataset is non-commercial) |
| 18 | Console lifetime sales, quarterly, 1994-2026 | ~125 | PS2, DS, Switch closing on the record | company reports, assembled by hand |
| 19 | The ten biggest films' first 60 days, overlaid day by day | 60 | Front-loaded openers get passed by films with long legs | Box Office Mojo / The Numbers |
| 20 | Smartphone shipments by maker, quarterly, 2007-2026 | ~76 | Nokia's collapse, Samsung and Apple trading, Huawei's rise and fall | IDC / Counterpoint releases |

## Notes for choosing

- **Channel fit.** D1 Came From Nowhere: 3, 9, 13, 14, 15. D2 The What-If Machine takes a real line from any
  row here and one stated assumption; keep what-ifs a minority.
- **The leader rarely changes** in 5 and 13: frame the race on the places below first.
- **Left out as flooded:** YouTube subscriber races, largest companies by market cap, country GDP and
  population, browser share, Messi against Ronaldo.
- **Series.** 1 repeats per country and per topic, 2 per country (Ember), 4 per statistic (poles, podiums,
  constructors), 5 per league, 8 by sex and by decade.
