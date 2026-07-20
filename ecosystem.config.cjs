const path = require("path");
const fs = require("fs");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function resolveNextBin(rootDir) {
  const candidates = [
    path.join(rootDir, "apps/web/node_modules/next/dist/bin/next"),
    path.join(rootDir, "node_modules/next/dist/bin/next"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    "next binary not found. Run: cd /var/www/Mercai-v2 && pnpm install && pnpm --filter @suvenir/web build"
  );
}

function resolveWebStart(rootDir) {
  const standalone = path.join(
    rootDir,
    "apps/web/.next/standalone/apps/web/server.js",
  );
  if (fs.existsSync(standalone)) {
    return { script: standalone, args: "", cwd: path.join(rootDir, "apps/web/.next/standalone") };
  }
  return {
    script: resolveNextBin(rootDir),
    args: "start -p 3000",
    cwd: path.join(rootDir, "apps/web"),
  };
}

const rootDir = __dirname;
const fileEnv = loadEnvFile(path.join(rootDir, ".env"));
const apiEntry = path.join(rootDir, "apps/api/dist/src/main.js");
const webStart = resolveWebStart(rootDir);

if (!fs.existsSync(apiEntry)) {
  console.warn("WARN: API build missing:", apiEntry);
}

module.exports = {
  apps: [
    {
      name: "mercai-api",
      cwd: rootDir,
      script: "pnpm",
      args: "--filter @suvenir/api start",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        ...fileEnv,
      },
    },
    {
      name: "mercai-web",
      cwd: webStart.cwd,
      script: webStart.script,
      args: webStart.args,
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        HOSTNAME: "127.0.0.1",
        ...fileEnv,
      },
    },
  ],
};
