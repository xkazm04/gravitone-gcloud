# The table for one stat reel

You research the numbers for one narration-free data video. A page will later draw every frame from your table,
and it may show only the numbers you write here. A wrong number is a wrong film, published under the operator's
name: when you cannot find a figure from a real source, leave it out, never estimate it.

## Read first

- `inputs/IDEA.md` - the title, the hook (the question the first seconds ask) and the path (why someone keeps
  watching). When the operator sent a previous table back, their words are at the bottom: they outrank this file.
- `inputs/TABLE-CONTRACT.md` - the exact shape of `out/table.json`, and the continuity gate it is measured against.
- `inputs/previous-table.json`, when it exists - the table that was sent back. Keep what was right; fix what the
  operator named.

## What to write

1. `out/table.json`, in the contract's shape, `v: 1`:
   - **One source, named.** `source.name` is the publisher and dataset as they title it, `source.url` the page you
     read the numbers from (https), `source.licence` the licence AS THE SOURCE STATES IT ("CC BY 4.0", "public
     domain (US government work)"). If the source states no licence, write `"not stated by the source"`; never
     guess one. `fetchedAt` is today's date.
   - **One period per real observation.** A month the source does not report is not a period; never interpolate.
     Period labels are short (at most 24 characters): `"1987"`, `"2021-03"`, `"Monaco 1984"`.
   - **Entities** are the things that race: at most 60, ids lower-case slugs, names at most 40 characters as a
     viewer knows them. A value is a finite number >= 0, or `null` where the source has no observation.
     `cumulative: true` only when the values are running totals (wins so far), and then they never fall.
   - **Events** are dated real-world causes the data reacts to, 5 to 15 of them: a bill passed, a contract signed,
     a government changed, a technology shipped. Each has a title (at most 60 characters), the date as a viewer
     reads it, ONE sentence of evidence (at most 140 characters) and the https URL where that sentence can be
     read. "One entity passed another" is the chart restating itself: not an event. Where no cause can be shown,
     no card.
2. `out/SOURCES.md` - every URL you read, one line each with what you took from it, and anything you could not
   confirm and therefore left out.

## What makes a table worth a film

Measured by the continuity gate in the contract: many real steps (about 60, or about 100 years for yearly data with
at least ten entities), five or more entities on screen, at least two changes of the lead, about fifteen visible
overtakes. A table under the gate is still written - the operator sees the failures and decides - but prefer the
framing that passes: finer steps, more entities, the chasers as well as the leaders.

## Never

- A number you did not read in a source. A figure from memory. A licence you assumed.
- Logos, likenesses, or anything that is not a number, a name, a date or a sentence of evidence.
- Writing anywhere but `out/`.
