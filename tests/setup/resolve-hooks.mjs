import { pathToFileURL } from "node:url";
import path from "node:path";

const SRC = pathToFileURL(path.resolve(process.cwd(), "src") + path.sep).href;
const SUFFIXES = ["", ".js", ".jsx", "/index.js"];

export async function resolve(specifier, context, nextResolve) {
  // "server-only" throws outside the React server bundle; it's a no-op for tests.
  if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };

  const target = specifier.startsWith("@/") ? SRC + specifier.slice(2) : specifier;
  let lastError;
  for (const suffix of SUFFIXES) {
    try {
      return await nextResolve(target + suffix, context);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
