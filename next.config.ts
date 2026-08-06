import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-only publishing clients. ssh2 ships optional native bindings
  // and basic-ftp is plain Node networking; neither belongs in the
  // bundle, and letting the bundler at ssh2's .node files breaks builds.
  serverExternalPackages: ["basic-ftp", "ssh2-sftp-client", "ssh2"],
};

export default nextConfig;
