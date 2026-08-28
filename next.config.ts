import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Prevent webpack from bundling native Node.js modules that can't be statically bundled.
      // canvas is a native addon required by pdf-to-img; mupdf is WASM and must be loaded at runtime.
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : config.externals ? [config.externals] : []),
        "canvas",
      ];
    }
    return config;
  },
};

export default nextConfig;
