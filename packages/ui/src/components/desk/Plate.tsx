// The one <img> the desks draw (tiles, references, arms, the lens, the pair summary).
//
// @gt/ui imports nothing but @gt/domain, so next/image is not available here, and it would not
// help: a desk's media is a candidate's own bytes, served as they are by the blob door - the
// operator judges the pixels the producer made, not a resized, re-encoded stand-in. One element
// with the rule's exemption, instead of six.
export type PlateProps = { readonly src: string | undefined; readonly alt: string; readonly className?: string | undefined; readonly lazy?: boolean };

export function Plate({ src, alt, className, lazy = false }: PlateProps) {
  // eslint-disable-next-line @next/next/no-img-element -- a judged candidate is shown as its own bytes (see above)
  return <img className={className} src={src} alt={alt} loading={lazy ? "lazy" : undefined} />;
}
