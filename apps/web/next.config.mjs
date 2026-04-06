/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { dev }) => {
    if (dev) {
      // Windows: persistent pack cache can throw ENOENT on missing *.pack.gz after
      // partial .next deletes, AV scans, or sync tools. Memory cache avoids that.
      config.cache = { type: "memory" };
    }
    return config;
  },
};

export default nextConfig;
