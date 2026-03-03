/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  async rewrites() {
    return [
      {
        source: "/brand/:path*",
        destination: "/impulsion/brand/:path*",
      },
    ];
  },
  webpack: (config, { isServer }) => {
    // unzipper@0.12 has an optional S3 import that isn't needed
    if (isServer) {
      config.resolve.alias["@aws-sdk/client-s3"] = false;
    }
    return config;
  },
};

export default config;
