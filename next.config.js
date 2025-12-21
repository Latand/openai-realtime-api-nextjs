/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable Strict Mode - required for @picovoice/porcupine-react
  // The library doesn't handle Strict Mode's double-mounting correctly
  reactStrictMode: false,
  eslint: {
    ignoreDuringBuilds: false,
  },
};

module.exports = nextConfig;
