import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneRoot = path.join(webRoot, ".next", "standalone", "apps", "web");

if (!fs.existsSync(standaloneRoot)) {
  console.log("[standalone] skip: no standalone output");
  process.exit(0);
}

function copyDir(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
}

const staticSrc = path.join(webRoot, ".next", "static");
const publicSrc = path.join(webRoot, "public");
const staticDest = path.join(standaloneRoot, ".next", "static");
const publicDest = path.join(standaloneRoot, "public");

if (!fs.existsSync(staticSrc)) {
  console.error("[standalone] ERROR: missing .next/static");
  process.exit(1);
}
if (!fs.existsSync(publicSrc)) {
  console.error("[standalone] ERROR: missing public/");
  process.exit(1);
}

fs.mkdirSync(path.join(standaloneRoot, ".next"), { recursive: true });
copyDir(staticSrc, staticDest);
copyDir(publicSrc, publicDest);

if (!fs.existsSync(path.join(publicDest, "logo-full.png"))) {
  console.error("[standalone] ERROR: logo-full.png not copied");
  process.exit(1);
}

console.log("[standalone] copied static + public into standalone bundle");
