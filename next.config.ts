import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

// SENTRY_AUTH_TOKEN未設定時はソースマップアップロード等のビルド時連携を
// スキップするだけで、ビルド自体は失敗しない(withSentryConfigの既定挙動)。
export default withSentryConfig(nextConfig, {
  org: "riff-gear",
  project: "riff-gear",
  silent: true,
});
