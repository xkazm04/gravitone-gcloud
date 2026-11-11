# Robot parody trailers (channel P2, "Coming Soon")

Thirty-to-fifty-second trailers for famous films, remade in a robot world and played as real releases there. The
world is **Cinebot Pictures**: robots only, humans absent or a prop, photoreal footage shot as a named kind of
footage, one robot-only rule (battery, port, warranty, content policy) breaking each dramatic beat. The ten
trailers come from the thirteen saved concepts in `foundry-out/scout/contest-shortlist/robot-recast-scenes/`
(Caesar dropped: not a film; the two Titanic and the two Lord of the Rings concepts each merged into one trailer).

| Film | Trailer | From |
|---|---|---|
| The Terminator | Batch Seven | A-01 |
| A Few Good Men | Code Red, Hypothetically | A-02 |
| Predator | Pairing | A-03 |
| Titanic | I'll Never Let Go | A-05, C-02 |
| Saving Private Ryan | Sorry, I Didn't Catch That | A-06 |
| The Lord of the Rings | Forty Miles to a Charge | B-09, A-08 |
| The Empire Strikes Back | Previous Owner | B-05 |
| Pulp Fiction | Say "What" Again | B-10 |
| 300 | The Follow-Through | C-01 |
| The Exorcist | Two Speeds and Reverse | C-03 |

## The waves

1. **Visual casting (this wave).** 28 characters, five images each, one chassis lens per image (practical suit,
   appliance, heavy plant, retro plastic, current-gen). `roster.json` holds the world, the lenses and the cast.

   ```bash
   npx tsx pipeline/parody/casting.mts build --out foundry-out/parody-trailers/casting-1
   npx tsx pipeline/scout-codex.mts --queue foundry-out/parody-trailers/casting-1/queue.json \
     --out foundry-out/parody-trailers/casting-1 --workers 3
   ```

   Drawing runs on the ChatGPT seat through `codex exec` (no extra cost, about 65 s an image, resumable: start it
   again with the same `--out`). Open `foundry-out/parody-trailers/casting-1/verdict.html`: one pick per character,
   or "None work, re-roll" with a note. It autosaves in the browser; **Save verdicts.json** writes the file the next
   step reads. Rebuild the page after more images land (the page reads the folder, not a snapshot).
2. **Voice casting** (deferred until after the keyframes). Five voices per picked character. Reuse the casting stage of spark `concept-casting-stages`
   once it has had its first live run; the picked image is the voice brief's visual anchor.
3. **Trailer keyframes** (before voices, operator 2026-11-11). `shots.json`: eight shots per trailer across three or
   four scenes of the film, in the original film's own trailer look, composed so a 9:16 centre crop holds; each shot
   is drawn in three variants with the picked casting images attached. `motion` is the H3 clip's line (speech,
   `Sound: ...`, `No music.`) and is not drawn.

   ```bash
   npx tsx pipeline/parody/keys.mts build --casting foundry-out/parody-trailers/casting-1      --verdicts <casting-verdicts.json> --out foundry-out/parody-trailers/keys-1 [--pick terminator-assassin=c3]
   npx tsx pipeline/scout-codex.mts --queue foundry-out/parody-trailers/keys-1/queue.json      --out foundry-out/parody-trailers/keys-1 --workers 3
   ```

   The picked variant of each shot becomes that trailer's `/trailer-clip` keyframe; voices follow.
4. **Nightly composition.** Channel card `foundry-out/scout-channels/P2.json` (local, gitignored). Once the picks
   are in, set the channel look with `scout.mts channel-look P2 "<text>"` and import one episode per trailer.

## Rules held

- A character is recognised by role, silhouette and costume, never the original's exact look (the character-mirror
  measurement: Vader and Yoda came out as copies when the film's look was the brief).
- No actor's likeness, logo, title mark or score. Robots carry no human faces.
- Casting images are drawn on the seat: nothing here spends on a vendor, opens the store, or writes a verdict into a night.
