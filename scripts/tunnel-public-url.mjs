/**
 * Публикует локальный API :3001 наружу и пишет URL в uploads/public-api-url.txt
 * для OpenRouter (референсы лого и каталога по публичным ссылкам).
 *
 * TUNNEL_PROVIDER=localtunnel  — localtunnel / loca.lt
 * TUNNEL_PROVIDER=tailscale    — tailscale funnel --bg / *.ts.net (default)
 */
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const urlFile = join(root, 'uploads', 'public-api-url.txt');
const port = Number(process.env.API_PORT || process.env.TUNNEL_PORT || 3001);
const provider = (process.env.TUNNEL_PROVIDER || 'tailscale').toLowerCase();

async function persistPublicUrl(url) {
  const normalized = url.trim().replace(/\/$/, '');
  if (!/^https?:\/\//i.test(normalized)) {
    throw new Error(`Invalid tunnel URL: ${normalized}`);
  }
  await mkdir(dirname(urlFile), { recursive: true });
  await writeFile(urlFile, `${normalized}\n`, 'utf8');
  console.log(`[tunnel] Public API URL saved → uploads/public-api-url.txt`);
  console.log(`[tunnel] ${normalized}`);
  console.log(`[tunnel] Image refs: ${normalized}/uploads/temp/...`);
}

function extractUrl(text) {
  const tsNet = text.match(/https?:\/\/[a-z0-9-]+\.ts\.net[^\s"'<>]*/i);
  if (tsNet) return tsNet[0].replace(/[.,)\]}>]+$/, '');
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0].replace(/[.,)\]}>]+$/, '') : null;
}

function runTailscale(bin, args) {
  const r = spawnSync(bin, args, { encoding: 'utf8' });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  return { code: r.status ?? 1, out };
}

function resolveTailscaleBin() {
  if (process.env.TAILSCALE_BIN) return process.env.TAILSCALE_BIN;
  if (process.platform === 'win32') {
    const win = 'C:\\Program Files\\Tailscale\\tailscale.exe';
    if (existsSync(win)) return win;
  }
  return 'tailscale';
}

async function startLocaltunnel() {
  let localtunnel;
  try {
    ({ default: localtunnel } = await import('localtunnel'));
  } catch {
    console.error('[tunnel] Install localtunnel: pnpm add -D localtunnel -w');
    process.exit(1);
  }

  const openTunnel = async () => {
    const tunnel = await localtunnel({ port });
    await persistPublicUrl(tunnel.url);

    tunnel.on('close', () => {
      console.warn('[tunnel] localtunnel closed — reconnecting in 5s...');
      setTimeout(() => {
        openTunnel().catch((err) => {
          console.error('[tunnel] reconnect failed:', err.message);
          process.exit(1);
        });
      }, 5000);
    });

    tunnel.on('error', (err) => {
      console.error('[tunnel] localtunnel error:', err.message);
    });
  };

  await openTunnel();
}

async function startTailscale() {
  const tailscaleBin = resolveTailscaleBin();
  console.log(`[tunnel] tailscale funnel --bg → port ${port} (${tailscaleBin})`);

  const start = runTailscale(tailscaleBin, ['funnel', '--bg', String(port)]);
  process.stdout.write(start.out);

  if (start.out.includes('Funnel is not enabled')) {
    const enableUrl = start.out.match(/https:\/\/login\.tailscale\.com\/f\/funnel[^\s]*/)?.[0];
    console.error('\n[tunnel] Funnel не включён в tailnet.');
    console.error('[tunnel] 1) Откройте ссылку в браузере (войдите в Tailscale) и нажмите Enable');
    if (enableUrl) console.error(`[tunnel]    ${enableUrl}`);
    console.error('[tunnel] 2) Затем снова запустите start.bat');
    process.exit(1);
  }

  await new Promise((r) => setTimeout(r, 1500));
  const status = runTailscale(tailscaleBin, ['funnel', 'status']);
  process.stdout.write(status.out);

  let publicUrl = extractUrl(status.out);
  if (!publicUrl) {
    const dns = runTailscale(tailscaleBin, ['status', '--json']);
    const dnsMatch = dns.out.match(/"DNSName":\s*"([^"]+\.ts\.net)/);
    if (dnsMatch) publicUrl = `https://${dnsMatch[1].replace(/\.$/, '')}`;
  }

  if (!publicUrl?.includes('.ts.net')) {
    console.error('[tunnel] Не удалось получить *.ts.net URL. Проверьте: tailscale funnel status');
    process.exit(1);
  }

  await persistPublicUrl(publicUrl);
  console.log('[tunnel] Funnel работает в фоне (tailscale funnel --bg). Проверка: tailscale funnel status');
}

if (provider === 'tailscale') {
  startTailscale().catch((err) => {
    console.error('[tunnel] failed:', err.message);
    process.exit(1);
  });
} else {
  console.log(`[tunnel] localtunnel → port ${port}`);
  startLocaltunnel().catch((err) => {
    console.error('[tunnel] failed:', err.message);
    process.exit(1);
  });
}
