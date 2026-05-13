/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  // pdf-parse and pdfjs-dist use workers and canvas which can't be bundled by webpack.
  // Load them as native Node.js modules at runtime instead.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};
module.exports = nextConfig;

