// THE KIT CATALOG — the one typed list of what `components/kit` exports.
//
// The /kit route renders from it, components/kit/README.md is checked against it,
// and tests/golden-path/kit-catalog.probe.spec.ts fails when an export of
// components/kit/index.ts (or components/kit/brand/index.ts) has no entry here,
// when an entry names something no longer exported, or when the README stops
// listing an entry. Add a part to the kit and this file is the next edit; the page
// then refuses to typecheck until the part has a specimen (Parts.tsx).
//
// Plain data on purpose: no JSX, no `@/` imports, so a node probe can read it.

export interface KitPart {
  /** The exported name, exactly. */
  name: string;
  /** One line: the call shape. */
  api: string;
}

export interface KitGroup {
  id: string;
  title: string;
  /** What the group is for, as the README's "For" column says it. */
  for: string;
  parts: readonly KitPart[];
}

export const KIT_GROUPS = [
  {
    id: "root",
    title: "Root and sky",
    for: "the root, the starfield",
    parts: [
      { name: "WorldRoot", api: "<WorldRoot className?>children</WorldRoot>" },
      { name: "Sky", api: "<Sky/>" },
    ],
  },
  {
    id: "bar",
    title: "Bar and path",
    for: "top bar; the path",
    parts: [
      { name: "Bar", api: "<Bar brand crumbs? nav? right?/>" },
      { name: "Crumbs", api: "<Crumbs items={[{label, href? | onSelect?}]} label?/>" },
    ],
  },
  {
    id: "head",
    title: "Page head",
    for: "page title, figure slot; boxed word; gold caps line",
    parts: [
      { name: "PageHead", api: "<PageHead eyebrow title figure? caption?/>" },
      { name: "Tag", api: "<Tag>stylised</Tag>" },
      { name: "Kicker", api: "<Kicker>run id</Kicker>" },
    ],
  },
  {
    id: "rail",
    title: "Modules with counts",
    for: "modules with counts, proportions (signal, extended)",
    parts: [
      { name: "TabRail", api: "<TabRail label tabs=[{id,label,tally?,testId?}] active onSelect/>" },
      { name: "Tally", api: "<Tally value of? label? tone? hint?/>" },
      { name: "StackBar", api: "<StackBar label segments=[{n,tone,label,hatched?}]/>" },
    ],
  },
  {
    id: "status",
    title: "Status",
    for: "one mark per state; a run's state, facts, error, log, progress",
    parts: [
      { name: "StatusGlyph", api: "<StatusGlyph kind label? decorative? size?/>" },
      { name: "StatusPill", api: "<StatusPill kind>word</StatusPill>" },
      { name: "StatusStrip", api: "<StatusStrip kind word progress? facts? error? log? actions?/>" },
      { name: "Meridian", api: "<Meridian done total label?/>" },
    ],
  },
  {
    id: "score",
    title: "Scores and credits",
    for: "a score as a star; grader credit marks",
    parts: [
      { name: "Magnitude", api: "<Magnitude value/>" },
      { name: "gradeOf", api: "gradeOf(value) -> held | partial | missed | ungraded" },
      { name: "ScoreChip", api: "<ScoreChip label value/>" },
      { name: "FlagChip", api: '<FlagChip kind="text" | "unmeasured"/>' },
      { name: "pct", api: 'pct(value) -> "73%" | "—"' },
      { name: "Credit", api: "<Credit value={1 | 0.5 | 0}>field</Credit>" },
    ],
  },
  {
    id: "facts",
    title: "Facts and plates",
    for: "a labelled fact; image with registration corners",
    parts: [
      { name: "Chip", api: "<Chip name? tone? wrap?>value</Chip>" },
      { name: "Chips", api: "<Chips>chips</Chips>" },
      { name: "Plate", api: "<Plate flat?>image</Plate>" },
    ],
  },
  {
    id: "judge",
    title: "Judged candidate",
    for: "a judged candidate; K / X / U",
    parts: [
      { name: "Tile", api: "<Tile label src verdict focused state detail step chips actions flag/>" },
      { name: "VerdictKeys", api: '<VerdictKeys variant="tile|row|card" value onVerdict clear? toggle?/>' },
    ],
  },
  {
    id: "matrix",
    title: "Matrix",
    for: "pinned source frame + styles-by-mechanisms grid",
    parts: [
      { name: "Scene", api: "<Scene label aside>children</Scene>" },
      { name: "Matrix", api: "<Matrix label columns rows/>" },
      { name: "RowHead", api: "<RowHead name meta?>keys</RowHead>" },
    ],
  },
  {
    id: "list",
    title: "Side list",
    for: "runs, cycles, families",
    parts: [
      { name: "SideList", api: "<SideList label heading pinned? aside?>items</SideList>" },
      { name: "SideItem", api: "<SideItem glyph title meta current pressed count onSelect/>" },
    ],
  },
  {
    id: "entry",
    title: "Work entry",
    for: "a work row judged as a whole",
    parts: [
      { name: "Entry", api: "<Entry label focused verdict title lede aside/>" },
      { name: "VerdictMark", api: "<VerdictMark verdict keepWord?/>" },
      { name: "Column", api: "<Column label>matter</Column>" },
    ],
  },
  {
    id: "media",
    title: "Media",
    for: "media card; opening thumbnail; captioned strip",
    parts: [
      { name: "Card", api: "<Card label src what title meta status proven onOpen/>" },
      { name: "CardGrid", api: "<CardGrid>cards</CardGrid>" },
      { name: "Thumb", api: "<Thumb src alt label onOpen inForce chips flag/>" },
      { name: "Figures", api: "<Figures items=[{id,src,alt,caption,state?}]/>" },
    ],
  },
  {
    id: "pair",
    title: "A/B pair",
    for: "seed-matched A/B pair, pick marked",
    parts: [{ name: "Duo", api: "<Duo scene seed arms judge dissent?/>" }],
  },
  {
    id: "dock",
    title: "Dock",
    for: "the bottom bar",
    parts: [
      { name: "Dock", api: "<Dock label>children</Dock>" },
      { name: "Count", api: "<Count kind? n of? label/>" },
      { name: "SaveState", api: '<SaveState state="idle|saving|saved|error" final?/>' },
      { name: "KeyRow", api: "<KeyRow label map=[{keys,does}]/>" },
      { name: "LockNote", api: "<LockNote>one clause</LockNote>" },
      { name: "Final", api: "<Final>charted</Final>" },
      { name: "DockAction", api: "<DockAction>button</DockAction>" },
    ],
  },
  {
    id: "dialog",
    title: "Dialogs and sheets",
    for: "destructive confirm; full-screen comparison",
    parts: [
      { name: "ConfirmDialog", api: "<ConfirmDialog open title railLabel rail consequence confirmLabel tone/>" },
      { name: "Sheet", api: "<Sheet open title onPrev onNext footer/>" },
    ],
  },
  {
    id: "report",
    title: "After a commit",
    for: "the bar after a commit",
    parts: [
      { name: "Report", api: "<Report action?>counts</Report>" },
      { name: "OpenLink", api: "<OpenLink onClick>findings.md →</OpenLink>" },
    ],
  },
  {
    id: "doc",
    title: "Document",
    for: "what is read rather than judged",
    parts: [
      { name: "Doc", api: "<Doc>sections</Doc>" },
      { name: "DocLede", api: "<DocLede>mark · fact</DocLede>" },
      { name: "DocSection", api: "<DocSection label>matter</DocSection>" },
      { name: "Rule", api: "<Rule>the work's own words</Rule>" },
      { name: "DefList", api: "<DefList items=[{term,value}]/>" },
      { name: "Stats", api: "<Stats items=[{n,label}]/>" },
      { name: "DataTable", api: "<DataTable head rows/>" },
      { name: "Verbatim", api: "<Verbatim>text</Verbatim>" },
      { name: "Prose", api: "<Prose ink?>text</Prose>" },
    ],
  },
  {
    id: "notice",
    title: "Empty, loading, unreachable",
    for: "unreachable, loading, empty; a disclosure",
    parts: [
      { name: "ErrorBox", api: '<ErrorBox role="alert" action?>real error</ErrorBox>' },
      { name: "Loading", api: "<Loading/>" },
      { name: "Command", api: "<Command label>shell command</Command>" },
      { name: "Ghost", api: "<Ghost shape count glyph? action? label/>" },
      { name: "Hint", api: "<Hint variant tone?>twelve words</Hint>" },
    ],
  },
  {
    id: "forms",
    title: "Forms",
    for: "controls of a working surface",
    parts: [
      { name: "Dropzone", api: "<Dropzone accept constraints label onFiles/>" },
      { name: "TextField", api: "<TextField label value onChange placeholder?/>" },
      { name: "NumberField", api: "<NumberField label value min max onChange/>" },
      { name: "CheckField", api: "<CheckField label checked onChange/>" },
      { name: "FieldRow", api: "<FieldRow>fields</FieldRow>" },
      { name: "PanelBox", api: "<PanelBox>block</PanelBox>" },
      { name: "Field", api: "<Field label htmlFor? hint?>control</Field>" },
      { name: "TextInput", api: "<TextInput id value onChange placeholder? aria-invalid?/>" },
      { name: "TextArea", api: "<TextArea id value onChange rows? placeholder?/>" },
      { name: "NumberInput", api: "<NumberInput id unit value onChange min? max?/>" },
      { name: "Select", api: "<Select id value onChange>{<option/>}</Select>" },
      { name: "Segmented", api: "<Segmented label value options=[{id,label,note?}] onChange/>" },
      { name: "Button", api: '<Button variant="primary|ghost|danger|keep|reject" size="md|sm"/>' },
    ],
  },
  {
    id: "voice",
    title: "Claims and outcomes",
    for: "a claim with its source; the outcome of an action for a moment",
    parts: [
      { name: "Callout", api: '<Callout source? tone="gold|ald|ant" size="md|sm" dashed?>the claim</Callout>' },
      { name: "useToast", api: "const { toasts, push, dismiss } = useToast(); push({ kind, text, action?, ttl?, key? })" },
      { name: "ToastTray", api: "<ToastTray toasts onDismiss inline? label?/>" },
    ],
  },
  {
    id: "table",
    title: "Sortable table",
    for: "rows that are worked: sortable heads, a head that sticks",
    parts: [
      { name: "Table", api: "<Table label columns=[{id,head,cell,sortBy?,num?}] rows sort? defaultSort? onSort? maxHeight? onOpenRow? expandedId? onExpand? renderExpansion?/>" },
    ],
  },
  {
    id: "pager",
    title: "Windowed list",
    for: "a list that windows itself and shows how much lies beyond",
    parts: [
      { name: "Pager", api: "<Pager shown total onMore onAll? step? noun? auto?/>" },
      { name: "useWindow", api: "useWindow(items, {size?, step?}) -> {visible, shown, total, remaining, more, all, reset}" },
    ],
  },
  {
    id: "steps",
    title: "Studio steps",
    for: "Research, Script, Frames, Score, Cut as stars on a meridian",
    parts: [
      { name: "Steps", api: "<Steps label steps=[{id,label,state?,tally?,locked?,testId?}] current onSelect?/>" },
      { name: "STUDIO_STEPS", api: "[{id,label}] the five steps in production order; the caller sets state and tally" },
    ],
  },
  {
    id: "roving",
    title: "Roving focus",
    for: "one tab stop per grid; the arrows move within it",
    parts: [
      { name: "useRoving", api: "useRoving({count, active?, onActive?, onActivate?, arrows?, wrap?}) -> {containerProps, itemProps(i)}; <Tile rovingProps/>" },
    ],
  },
  {
    id: "account",
    title: "Account",
    for: "the bell and the user menu, in <Bar right>",
    parts: [
      { name: "NotificationBell", api: "<NotificationBell defaultOpen?/> reads useJobs; skins itself by useWorld" },
      { name: "UserMenu", api: "<UserMenu defaultOpen?/> reads useAuth; skins itself by useWorld" },
    ],
  },
  {
    id: "deck",
    title: "Deck",
    for: "a full-viewport wizard drawn as a card table (components/ui/deck, in the world)",
    parts: [
      { name: "Deck", api: "<Deck stages=[{id,label,headline,done,summary?,blockedHint?,advance?,content}] active onNavigate finishLabel onFinish busy? notice? exit?/>" },
      { name: "DeckStage", api: "<DeckStage cards pickedId onPick noUnpick? renderCard?/>" },
      { name: "DeckCard", api: '<DeckCard spec={{id,title,art,density?,eyebrow?,body?,chips?,risk?,footnote?,detail?,disabled?}} picked onPick noUnpick?/>' },
      { name: "StageRail", api: "<StageRail stages=[{id,label,done,summary?}] active onNavigate reachable/>" },
    ],
  },
  {
    id: "menu",
    title: "Menu and tree",
    for: "a right-click menu over a row; a tree of named places",
    parts: [
      { name: "ContextMenu", api: "<ContextMenu label x y items=[{id,label,onSelect,destructive?,disabled?,keys?}] onClose inline?/>" },
      { name: "FolderTree", api: "<FolderTree label nodes selected expanded onSelect onToggle total? dragActive? over? onOver? onDropOn? onRename? onMenu?/>" },
    ],
  },
  {
    id: "layers",
    title: "Layers",
    for: "SideList rows that reorder",
    parts: [
      { name: "LayerList", api: "<LayerList label heading layers=[{id,kind,name,hidden?,flag?}] selectedId emptyLabel onSelect onReorder(id,toIndex) onToggleHidden onRemove/>" },
    ],
  },
  {
    id: "player",
    title: "Player",
    for: "transport marks and a magnitude waveform, controlled",
    parts: [
      { name: "Transport", api: "<Transport label playing position duration step? disabled? onToggle onSeek/>" },
      { name: "Waveform", api: "<Waveform label peaks position duration marks?=[{at,label}] disabled? onSeek/>" },
      { name: "Player", api: '<Player label kind="audio|video" screen? peaks marks? playing position duration disabled? onToggle onSeek/>' },
      { name: "clock", api: 'clock(seconds) -> "0:07" | "1:02:03"' },
    ],
  },
  {
    id: "timeline",
    title: "Timeline",
    for: "tracks on a time axis with cues as marks",
    parts: [
      { name: "Timeline", api: "<Timeline label duration tracks=[{id,label,clips:[{id,label,start,dur,state?,offset?}]}] cues? playhead? selectedId? onSelect? tick? pxPerSecond?/>" },
    ],
  },
  {
    id: "brand",
    title: "Brand marks",
    for: "the G asterism, the wordmark (components/kit/brand)",
    parts: [
      { name: "Mark", api: "<Mark size strokeWidth? construction? title?/>" },
      { name: "Wordmark", api: "<Wordmark height track?/>" },
      { name: "ASTERISM_PATH", api: "the G as four arcs and the crossbar: SVG path data, radius 10" },
      { name: "ASTERISM_STARS", api: "[{step, x, y, r, bearing}] the five studio steps" },
    ],
  },
] as const satisfies readonly KitGroup[];

export type PartName = (typeof KIT_GROUPS)[number]["parts"][number]["name"];

export const PART_COUNT = KIT_GROUPS.reduce((n, g) => n + g.parts.length, 0);

// ── IDENTITY DATA ───────────────────────────────────────────────────────────

export interface TokenRole {
  name: string;
  role: string;
  use: string;
  surface: "all" | "working" | "figure";
  /** May this token be drawn as text? `false` rows show their ratio as a fact about the fill, ring or rule. */
  text: boolean;
}

/** Every key of WORLD_ALMANAC, with its role and where it is drawn. The probe fails on a key with no row. */
export const TOKEN_ROLES: Record<string, TokenRole> = {
  "--al-night": { name: "Prussian Night", role: "the ground", use: "page ground, plates, the token under text", surface: "all", text: false },
  "--al-deep": { name: "Deep Field", role: "darker than the ground", use: "frames, occulting disc, scrims, the veil", surface: "all", text: false },
  "--al-field": { name: "Field", role: "raised panel", use: "panels, table heads, the rejected disc", surface: "all", text: false },
  "--al-gold": { name: "Gold Leaf", role: "the line of the cut; the ring of focus", use: "engraving, focus outline, the one call to act; gold caps", surface: "all", text: true },
  "--al-white": { name: "Star White", role: "text, level one", use: "headings, values, star-points, anything a person reads first", surface: "all", text: true },
  "--al-vellum": { name: "Vellum", role: "text, level two: the only muting", use: "secondary text, names in chips, labels, crumbs", surface: "all", text: true },
  "--al-ash": { name: "Ash", role: "what was rejected", use: "reject rings, grid rules, hairlines, the undecided ground; never text", surface: "all", text: false },
  "--al-ald": { name: "Aldebaran", role: "a person kept this", use: "keep ring, pick, the Cut star; as text use --al-ald-t", surface: "all", text: false },
  "--al-ald-t": { name: "Aldebaran, as text", role: "the red, lightened to read", use: "a kept count, the word kept, a pick's slug", surface: "all", text: true },
  "--al-ant": { name: "Antares", role: "an error; what a commit deletes", use: "failed ring and fill, danger border; as text use --al-ant-t", surface: "working", text: false },
  "--al-ant-t": { name: "Antares, as text", role: "the error red, lightened to read", use: "failed word, ErrorBox, veto, the sign-in error", surface: "working", text: true },
  "--al-tint-templates": { name: "Templates tint", role: "constellation hue", use: "the Templates figure; its label is the tint mixed 70/30 with white", surface: "figure", text: false },
  "--al-tint-bracket": { name: "Bracket tint", role: "constellation hue", use: "the Bracket figure; its label is the tint mixed 70/30 with white", surface: "figure", text: false },
  "--al-tint-disciplines": { name: "Disciplines tint", role: "constellation hue", use: "the Disciplines figure; its label is the tint mixed 70/30 with white", surface: "figure", text: false },
  "--al-tint-engines": { name: "Engines tint", role: "constellation hue", use: "the Engines figure; its label is the tint mixed 70/30 with white", surface: "figure", text: false },
  "--al-line": { name: "Line", role: "hairline", use: "rules between sections, panel borders", surface: "all", text: false },
  "--al-line-strong": { name: "Line, strong", role: "hairline that is a boundary", use: "boxed words, active borders", surface: "all", text: false },
  "--al-sky": { name: "Sky", role: "the ground gradient", use: "the page background behind <Sky>", surface: "all", text: false },
  "--al-ease": { name: "Ease", role: "the one curve", use: "every transition and animation in the kit", surface: "all", text: false },
};

/** Tokens whose value is not a flat colour: shown as a role only, no contrast. */
export const NON_COLOUR: readonly string[] = ["--al-line", "--al-line-strong", "--al-sky", "--al-ease"];

export interface TypeRole {
  role: string;
  family: "font-instrument" | "font-hanken" | "font-jetbrains";
  /** The class or utility that produces it. */
  spelling: string;
  size: string;
  where: string;
  sample: string;
  className: string;
}

export const TYPE_ROLES: readonly TypeRole[] = [
  { role: "Display", family: "font-instrument", spelling: "k-it · PageHead h1", size: "48–84px fluid, upright, 400", where: "page titles, the work's voice", sample: "Pick the stars.", className: "kr-t-display" },
  { role: "Name", family: "font-instrument", spelling: "k-it · Entry h3, Card h3", size: "28–30px, upright, 400", where: "a style, a card, a constellation, a tab", sample: "Paper Relief", className: "kr-t-name" },
  { role: "Body", family: "font-hanken", spelling: "text-content · k-world", size: "18px, 450, white", where: "anything a person reads", sample: "Seed-matched, pick marked.", className: "kr-t-body" },
  { role: "Secondary", family: "font-hanken", spelling: "k-muted · vellum", size: "16px, 450, vellum", where: "facts, metadata, captions, crumbs", sample: "flux-dev · seed 3 · 36 candidates", className: "kr-t-2nd" },
  { role: "Label", family: "font-hanken", spelling: "k-caps · text-label", size: "16px caps, 500, 0.1em", where: "kickers, column heads, counts, steps", sample: "GRV·07 · Templates", className: "kr-t-label" },
  { role: "Door label", family: "font-hanken", spelling: "door.module.css .sc", size: "14–16px fluid caps, 500, 0.1em", where: "chart labels, crumbs, steps on the door", sample: "Templates · 5 stars", className: "kr-t-door" },
  { role: "Mono", family: "font-jetbrains", spelling: "font-jetbrains · code", size: "16px", where: "tokens, ids, commands, verbatim", sample: "--al-ease", className: "kr-t-mono" },
];

export interface MotionBeat {
  beat: string;
  value: string;
  where: string;
}

export const MOTION: readonly MotionBeat[] = [
  { beat: "Ease", value: "--al-ease · cubic-bezier(0.2, 0.7, 0.1, 1)", where: "every kit transition and animation" },
  { beat: "Arrival, dialog", value: "scrim 450ms · panel rise 550ms", where: "ConfirmDialog, Sheet" },
  { beat: "Arrival, door", value: "3.4s, skippable by any press; the cut draws last", where: "the door (app/_landing)" },
  { beat: "Pick", value: "ring draws 700ms · flare 1.1s", where: "Tile kept" },
  { beat: "Occult", value: "disc slides 800ms · picture to ash 600ms", where: "Tile rejected" },
  { beat: "Return", value: "focus corners close 350ms · tile lift 400ms", where: "Tile focused" },
  { beat: "Progress", value: "meridian 600ms · rail 500ms · tab rule 700ms", where: "Meridian, StackBar, TabRail" },
  { beat: "Only loops", value: "live ring 6s · reticle while hovered", where: "StatusGlyph live, door star hover" },
  { beat: "Reduced motion", value: "no animation · transitions 200ms", where: "prefers-reduced-motion: reduce" },
];

export interface LawRule {
  rule: string;
  gate: string;
}

export const RULES: readonly LawRule[] = [
  { rule: "The app does not explain itself.", gate: "check:narration, and the diff read by a person" },
  { rule: "State rides on tallies, marks and shapes.", gate: "signal/README.md; StatusGlyph, Tally, Magnitude" },
  { rule: "A part has no slot for a paragraph.", gate: "review of the API column below" },
  { rule: "A disclosure past twelve words is narration: delete it.", gate: "check:narration (25-word hard cap)" },
  { rule: "Real errors explain in full, verbatim.", gate: "ErrorBox, SaveState" },
  { rule: "A destructive confirm states its consequence.", gate: "ConfirmDialog rail + consequence" },
  { rule: "One red means a person decided.", gate: "Aldebaran on keep, pick, Cut only" },
  { rule: "Antares appears on working surfaces only.", gate: "TOKEN_ROLES surface: working" },
  { rule: "Colour is a token. A missing hue is a report.", gate: "chrome-colour-literals probe" },
  { rule: "Nothing below 16px; the door's chart labels are 14px.", gate: "check:type; the type-pass audit for the door" },
  { rule: "No italics: the display voice is Instrument Serif upright.", gate: "type-pass audit (italic nodes = 0); the diff" },
  { rule: "One muting level: white, then vellum, both 11:1 or better.", gate: "/kit contrast table, computed from WORLD_ALMANAC" },
  { rule: "No grey text: ash is for rings and rules; a hue as text is lightened toward white, never faded.", gate: "type-pass audit (ash text = 0, text under 7:1 counted); the diff" },
  { rule: "State is never a dimmer colour: locked, disabled, low and rejected take a dashed edge or a rule.", gate: "type-pass audit (dimmed text counted); the diff" },
  { rule: "Every mark has an accessible name.", gate: "StatusGlyph label, aria-label on keys" },
  { rule: "A local duplicate of a kit part is a finding.", gate: "components/kit/README.md" },
];

export const WHEN_TO_USE: readonly { situation: string; use: string; never: string }[] = [
  { situation: "A list of things with a state", use: "SideList + StatusGlyph", never: "a column of status words" },
  { situation: "A judgement on a picture", use: "Tile, or Entry for a whole row", never: "a verdict in prose" },
  { situation: "An irreversible action", use: "ConfirmDialog, arithmetic on the rail", never: "a warning paragraph" },
  { situation: "Heavy content", use: "Sheet", never: "a bigger modal" },
  { situation: "An empty list", use: "Ghost; unreachable: ErrorBox + retry", never: "\"nothing here yet\"" },
  { situation: "Counts on a module", use: "Tally on the TabRail tab", never: "a blurb under the tabs" },
];
