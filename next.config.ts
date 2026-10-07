import type { NextConfig } from "next";

const isTauriBuild = process.env.TAURI_BUILD === "1";

const nextConfig: NextConfig = {
  reactCompiler: true,
  devIndicators: false,
  ...(isTauriBuild
    ? {
        output: "export" as const,
        trailingSlash: true,
        images: {
          unoptimized: true,
        },
      }
    : {}),
};

export default nextConfig;
