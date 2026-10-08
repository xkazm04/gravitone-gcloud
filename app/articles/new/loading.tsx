// This segment renders on demand (ƒ in `next build`), so a navigation into it
// waits on a server round trip before anything changes. With a loading.tsx the
// router swaps to this box at once and streams the page in behind it.
import { Pending } from "@/components/ui/Pending";

export default function Loading() {
  return <Pending tall />;
}
