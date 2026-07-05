/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces a self-contained server build (.next/standalone) for Docker/Railway.
  output: "standalone",
  // Allow the Next dev server to accept cross-origin dev requests from LAN
  // devices and from a Cloudflare quick tunnel (used for sharing the POC).
  allowedDevOrigins: ["*.trycloudflare.com", "*.ngrok-free.app", "*.ngrok.io"],
};

export default nextConfig;
