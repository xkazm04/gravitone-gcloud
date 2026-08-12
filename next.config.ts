import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A second `next dev` in the same project refuses to start: the first one
  // holds a lock inside the build directory. That is right for humans and wrong
  // for automation, which needs its own server (with NEXT_PUBLIC_DEV_AUTH=1)
  // alongside whatever the developer already has running.
  //
  // Giving the drive script its own dist dir gives it its own lock:
  //   NEXT_DIST_DIR=.next-drive NEXT_PUBLIC_DEV_AUTH=1 npx next dev -p 3183
  //
  // Defaults to `.next`, so an ordinary `npm run dev` / `npm run build` is
  // completely unchanged.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
