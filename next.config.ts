import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
    ],
    localPatterns: [
      {
        pathname: "/api/poster-placeholder",
        search: "?title=*",
      },
    ],
  },
};

export default nextConfig;
