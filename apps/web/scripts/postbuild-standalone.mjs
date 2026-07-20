#!/usr/bin/env node
/**
 * Next.js standalone output does not include public/ or .next/static.
 * PM2 runs the standalone server — copy assets after every build.
 */
import { cpSync, existsSync } from "fs";
import { join } from "path";

const webRoot = join(import.meta.dirname, "..");
const standaloneRoot = join(webRoot, ".next", "standalone", "apps", "web");

if (!existsSync(standaloneRoot)) {
  console.log("postbuild-standalone: no standalone output, skip");
  process.exit(0);
}

const publicSrc = join(webRoot, "public");
const publicDest = join(standaloneRoot, "public");
const staticSrc = join(webRoot, ".next", "static");
const staticDest = join(standaloneRoot, ".next", "static");

cpSync(publicSrc, publicDest, { recursive: true });
cpSync(staticSrc, staticDest, { recursive: true });
console.log("postbuild-standalone: copied public + .next/static → standalone");
