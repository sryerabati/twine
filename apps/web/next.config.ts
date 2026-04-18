import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const apiPort = process.env.API_PORT ?? "8000";
    const backend = `http://127.0.0.1:${apiPort}`;

    return [
      {
        source: "/api/:path*",
        destination: `${backend}/api/:path*`,
      },
      {
        source: "/storage/:path*",
        destination: `${backend}/storage/:path*`,
      },
    ];
  },
};

export default nextConfig;
