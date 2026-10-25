import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Stellar and Blend SDKs are large Node libraries; keep them out of the client bundle.
  serverExternalPackages: ["@stellar/stellar-sdk", "@blend-capital/blend-sdk"],
  poweredByHeader: false,
};

export default nextConfig;
