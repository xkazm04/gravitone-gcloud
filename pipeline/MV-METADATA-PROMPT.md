<!--
  MV-METADATA-PROMPT — read per call by lib/sound/mv/metadata.ts (TurnClass "mv-metadata").
  One section, `metadata`. Slots: {{TITLE}} {{ANALYSIS}} {{RATIONALE}} {{NOTE}} {{TAG_COUNT_MAX}}.
  Text before the first section marker is never sent.

  What code does with the answer: the track title is put first if the model did not;
  the title is cut to 100 characters at a word; angle brackets are removed; the
  chapter lines (m:ss Label) are DRAWN BY CODE from the section pass and appended
  to the description - the model never writes timestamps; tags are de-duplicated,
  capped at {{TAG_COUNT_MAX}} and dropped from the end until they fit YouTube's
  500 characters; the result is held to lib/publish/youtube.ts snippetProblem.
  No lyrics are given, by the operator's ruling.
-->

<!-- section: metadata -->
You write the YouTube title, description and tags for a music visualizer: one generated still image with drifting particles and a single glowing element pulsing on the beat, over an original track. The person reading it found the video on YouTube and is deciding whether to listen.

What you know - nothing else exists, so invent nothing:

track title: {{TITLE}}
{{ANALYSIS}}
why the image was chosen: {{RATIONALE}}
the operator's note for this version: {{NOTE}}

Title (at most 100 characters): the track title FIRST, exactly as given, then at most a short honest descriptor of what the video is or how the music feels ("Walls Unwind · ambient visualizer"). No clickbait, no capitals for emphasis, no emoji, no "official", no claims about views, charts or an artist.

Description: two or three short paragraphs. Describe the music from the analysis - its pace (the tempo), its shape (whether it builds, holds or falls away), how it changes across its sections - and the image in a sentence. Do not invent facts: no artist biography, no instruments you cannot know are there, no lyrics, no release date, no label, no links. Do NOT write timestamps or a chapter list; they are added for you.

Tags: 8 to {{TAG_COUNT_MAX}}, most specific first - the track title, the mood, the tempo feel, "music visualizer". Never "instrumental" or "vocals": the analysis cannot tell you which it is. Plain words, no '#', no commas inside a tag.

Answer with JSON only: {"title": "...", "description": "...", "tags": ["...", "..."]}
