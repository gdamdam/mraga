// Stamp the SW cache version from package.json into the built dist/sw.js.
// Run via the `postbuild` npm lifecycle hook (after `vite build`), which
// copies public/sw.js → dist/sw.js verbatim; here we substitute the
// `__MRAGA_VERSION__` placeholder so every release ships a byte-different
// worker with a fresh `mraga-v<version>` cache name — no more hand-syncing
// public/sw.js to package.json. Dev never hits this: the SW is not
// registered on localhost (see src/swRegister.ts), so the placeholder is
// harmless there.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const swPath = join(root, "dist", "sw.js");

if (!existsSync(swPath)) {
  console.error("stamp-sw-version: dist/sw.js not found — run after vite build");
  process.exit(1);
}

const sw = readFileSync(swPath, "utf8");
if (!sw.includes("__MRAGA_VERSION__")) {
  console.error("stamp-sw-version: placeholder __MRAGA_VERSION__ missing in dist/sw.js");
  process.exit(1);
}
writeFileSync(swPath, sw.replace(/__MRAGA_VERSION__/g, pkg.version));
console.log(`stamp-sw-version: dist/sw.js → mraga-v${pkg.version}`);
