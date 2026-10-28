---
name: scout-muse
memory: none
version: 2.0.0
category: Development
description: RETIRED - merged into /scout (spark scout-vision S3, 2026-10-25). Characters are grown by /scout night from kept character seeds (dating-sim, companion-chat, roleplay, parody casts), with card rules set by audience and app, a judged reference sheet per kept character, and casting into storyboards, trials, scene stills and artboards. The four muse nights are a read-only archive - `/scout status --wing muse` lists them. Invoke /scout instead.
argument-hint: "status"
allowed-tools: Read, Bash
---

# Scout-muse - merged into /scout

The muse wing is part of the scout loop since 2026-10-25 (spark scout-vision S3). Run `/scout night`; its step 4b
grows characters and step 2d draws their reference sheets.

- `/scout-muse status` -> `npx tsx pipeline/scout.mts status --wing muse --json`: the archive nights, read-only.
- Kept characters stay in `knowledge/scout-muse/characters.md`; the technique notes in
  `knowledge/scout-muse/techniques.md` are read by /scout's taste brief.
- Nothing opens a night here: `open`, `ideas` and every other act under `--wing muse` refuse, naming /scout.
