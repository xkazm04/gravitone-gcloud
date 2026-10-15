// The packet id out of its one path segment. links.ts `boardFor` encodes the id as ONE segment
// (`pkt:forge:sweep-01` -> `pkt%3Aforge%3Asweep-01`); Next hands the segment back decoded on some
// paths and still encoded on others, so it is decoded here once, and a segment that is not valid
// percent-encoding is taken as it came (an id never needs a literal `%`).
export function packetParam(raw: string): string {
  if (!raw.includes("%")) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
