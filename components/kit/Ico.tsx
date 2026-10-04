// SMALL LINE MARKS shared by the menu, tree, layer and transport parts. Not
// exported from the kit barrel: a part draws one of these, a surface never does.
// Every mark is drawn in currentColor on a 16 grid and is decorative: the control
// that carries it names itself (aria-label), so a mark never has to.

export type IcoName =
  | "chev"
  | "folder"
  | "folder-open"
  | "eye"
  | "eye-off"
  | "trash"
  | "grip"
  | "play"
  | "pause"
  | "back"
  | "fwd"
  | "merge";

const PATHS: Record<IcoName, React.ReactNode> = {
  chev: <path d="M6 3.5 10.5 8 6 12.5" />,
  folder: <path d="M2 4.5h4l1.5 1.8H14v6.7H2z" />,
  "folder-open": (
    <>
      <path d="M2 12.8V4.5h4l1.5 1.8H13v2.2" />
      <path d="M2 12.8 4 8.5h10.5l-2 4.3z" />
    </>
  ),
  eye: (
    <>
      <path d="M1.5 8C3 5.2 5.3 3.8 8 3.8S13 5.2 14.5 8C13 10.8 10.7 12.2 8 12.2S3 10.8 1.5 8z" />
      <circle cx="8" cy="8" r="1.9" />
    </>
  ),
  "eye-off": (
    <>
      <path d="M1.5 8C3 5.2 5.3 3.8 8 3.8S13 5.2 14.5 8C13 10.8 10.7 12.2 8 12.2S3 10.8 1.5 8z" strokeDasharray="1.6 1.6" />
      <path d="M2.5 13.5 13.5 2.5" />
    </>
  ),
  trash: (
    <>
      <path d="M3 4.5h10M6.2 4.5V3h3.6v1.5M4.3 4.5l.6 8.5h6.2l.6-8.5" />
      <path d="M6.7 7v4M9.3 7v4" />
    </>
  ),
  grip: (
    <>
      <circle cx="6" cy="4" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="10" cy="4" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="6" cy="8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="10" cy="8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="6" cy="12" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="10" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  play: <path d="M5 3 13 8 5 13z" fill="currentColor" />,
  pause: (
    <>
      <path d="M5 3.2v9.6M11 3.2v9.6" strokeWidth="2.4" />
    </>
  ),
  back: (
    <>
      <path d="M12.5 3.5 6 8l6.5 4.5z" fill="currentColor" />
      <path d="M3.5 3.5v9" />
    </>
  ),
  fwd: (
    <>
      <path d="M3.5 3.5 10 8l-6.5 4.5z" fill="currentColor" />
      <path d="M12.5 3.5v9" />
    </>
  ),
  merge: <path d="M2.5 3.5 8 8v4.5M13.5 3.5 8 8" />,
};

export function Ico({ name, size = 16 }: { name: IcoName; size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="k-ico"
    >
      {PATHS[name]}
    </svg>
  );
}
