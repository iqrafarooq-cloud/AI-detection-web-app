/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig = {
  poweredByHeader: false,
  // Hide the floating "N" dev-tools badge in development. Compile and runtime
  // errors are still shown. (It never appears in production builds.)
  devIndicators: false,
  // Locally downloaded detector models (~650 MB) must never be bundled into a
  // server function (Vercel's limit is 250 MB). They are downloaded at runtime.
  outputFileTracingExcludes: {
    "/*": [".cache/**/*"],
  },
  serverExternalPackages: ["mammoth", "word-extractor", "unpdf", "@huggingface/transformers", "onnxruntime-node"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
