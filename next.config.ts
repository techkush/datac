import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Produce a self-contained server (.next/standalone) so the datac daemon can
  // run it from ~/.datac/app without a full node_modules install.
  output: "standalone",
  // Trace deps from THIS project root, not the parent dir with a stray lockfile.
  outputFileTracingRoot: path.join(__dirname),
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
