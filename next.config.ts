import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Pin the workspace root so the stray parent lockfile doesn't confuse Turbopack.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
