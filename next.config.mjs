/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// The local detector runs on native binaries (ONNX Runtime, and sharp, which
// Transformers.js loads at startup). Next.js file tracing can't see these
// dynamically required files, so without this list they are missing from the
// deployed functions and the detector fails to load (it still works locally,
// where the full node_modules folder is present). Only the binaries for the
// build machine's platform are included, which on Vercel is the runtime one.
const detectorNativeFiles = [
  "./node_modules/onnxruntime-common/**",
  "./node_modules/onnxruntime-node/package.json",
  "./node_modules/onnxruntime-node/dist/**",
  `./node_modules/onnxruntime-node/bin/*/${process.platform}/${process.arch}/**`,
  "./node_modules/sharp/**",
  "./node_modules/@img/**",
  "./node_modules/detect-libc/**",
  "./node_modules/semver/**",
];

const nextConfig = {
  poweredByHeader: false,
  // Hide the floating "N" dev-tools badge in development. Compile and runtime
  // errors are still shown. (It never appears in production builds.)
  devIndicators: false,
  // Locally downloaded detector models (~650 MB) must never be bundled into a
  // server function (Vercel's limit is 250 MB). They are downloaded at runtime.
  outputFileTracingIncludes: {
    "/api/analyze": detectorNativeFiles,
    "/api/humanize": detectorNativeFiles,
  },
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
