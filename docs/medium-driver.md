# The Medium driver

`lib/medium/` pastes an article run's post into a PRIVATE draft in the operator's own, signed-in
Medium account, over the Chrome DevTools Protocol. There is no Medium API and no key: the account
is the operator's. It makes a draft and stops. It cannot publish (`selectors.ts` has no entry for
it, `driver.ts` aborts every request matching `api.forbidden`, `articles-medium.probe.spec.ts`
fails on a publish/schedule/submit button name).

## Setup

`npm run medium:browser` opens Chrome on `~/.medium-chrome` with CDP on `127.0.0.1:9335`, at
`medium.com/new-story`. Sign in once (Google works; the profile keeps the session). Then set
`MEDIUM_DRIVER=live` in `.env.local`. Chrome 136+ refuses a debugging port on the default profile,
which is why the profile is its own. The driver never calls `browser.close()` and closes only the
tab it opened.

## How a draft is made (recon 2026-10-16)

- The editor is one contenteditable, `div.postArticle-content.js-postField`. A synthetic
  `ClipboardEvent("paste")` carrying `text/html` goes through Medium's own parser: the first `h1`
  becomes the Title (`h3.graf--title`), `h2` becomes `h3`, `h3` becomes `h4`, a blockquote becomes
  an italic quote, a fenced block is auto-highlighted (`Auto (TypeScript)`), links are wrapped in
  `medium.com/r/?url=`.
- A figure cannot be pasted as `<img src="figures/…">`. Each `<figure>` becomes a marker paragraph;
  after the paste the marker is selected and emptied and the PNG is pasted as a `File`. Medium
  uploads it (`cdn-images-1.medium.com`), and the caption is typed into `figcaption.imageCaption`.
- A Markdown table has no Medium equivalent (the editor has no table element; a pasted table
  is one paragraph of pipes). `lib/articles/mediumPackage.ts` renders each table to
  `figures/table-NN.png` and the story carries it as an uncaptioned figure, in its place.
- Figure PNGs are rendered at the SVG's own size and scaled to 2800 px. A wider page left a
  680 px drawing in the corner of a blank canvas, which Medium showed cropped (2026-10-16).
- Medium saves by itself (`POST /p/<id>/deltas`) and the address becomes `/p/<id>/edit`. Saves are
  debounced batches: the driver closes the tab only after none has been in flight for 5 s,
  then reloads the draft and reads back how many figures and leftover markers it holds. The
  run records `figures` (read back) and `figuresOf` (in the story), and the gate shows "N of M"
  in amber when they differ. Closing after the first save once lost three of thirteen figures. A second
  call with `existingUrl` selects all and pastes over it: same draft, one title, no duplicate
  figures (measured: 13 s for a one-figure story).
- The driver reads the Title back and throws if Medium did not take it.

## Re-running the recon

When a draft fails with "medium did not take the title" or "the medium editor did not open", the
editor changed. Attach to the profile, open `/new-story`, list `[contenteditable]` and the
buttons, paste the sample, and read the resulting `innerHTML`; fix only `selectors.ts` and date
the entries. Do not touch the Publish button, even to read it.

## Known limits

Captions keep their text but not their links or emphasis. A table is a picture: its text is in
the image and its alt text names the columns, not the cells. Tags are chosen in Medium's publish
dialog, so they stay in `medium/tags.txt`. A recon draft titled "Spark recon: a paste test" may sit
in the account and can be deleted by hand.
