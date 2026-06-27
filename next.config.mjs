/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: ["bullmq", "ioredis"],
  },
};

export default nextConfig;
