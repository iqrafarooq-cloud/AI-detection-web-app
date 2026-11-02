// Lets `node --test` resolve the "@/..." alias and extensionless imports used by Next.js code.
import { register } from "node:module";

register("./resolve-hooks.mjs", import.meta.url);
