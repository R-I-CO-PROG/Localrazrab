import { Logger } from '@nestjs/common';

export interface HordeSubmitOptions {
  prompt: string;
  width: number;
  height: number;
  steps?: number;
  model?: string;
  sourceImageBase64?: string;
  extraSourceImagesBase64?: string[];
  denoisingStrength?: number;
  apiKey?: string;
  clientAgent?: string;
  baseUrl?: string;
  pollMs?: number;
  timeoutMs?: number;
  logger?: Logger;
}

export async function stableHordeGenerate(opts: HordeSubmitOptions): Promise<Buffer> {
  const logger = opts.logger ?? new Logger('StableHordeClient');
  const baseUrl = opts.baseUrl ?? 'https://aihorde.net/api/v2';
  const apiKey = opts.apiKey ?? '0000000000';
  const clientAgent = opts.clientAgent ?? 'suvenir-mvp:1.0:local-dev';
  const headers = {
    'Content-Type': 'application/json',
    apikey: apiKey,
    'Client-Agent': clientAgent,
  };

  const steps = Math.min(opts.steps ?? 25, 50);
  const width = Math.min(opts.width, 576);
  const height = Math.min(opts.height, 576);

  const body: Record<string, unknown> = {
    prompt: opts.prompt,
    params: {
      width,
      height,
      steps,
      cfg_scale: 7,
      sampler_name: 'k_euler_a',
      karras: true,
      ...(opts.denoisingStrength != null ? { denoising_strength: opts.denoisingStrength } : {}),
    },
    nsfw: false,
    censor_nsfw: true,
    trusted_workers: false,
    slow_workers: true,
    r2: true,
  };

  if (opts.model && opts.model !== 'any') {
    body.models = [opts.model];
  }

  if (opts.sourceImageBase64) {
    body.source_image = opts.sourceImageBase64;
    body.source_processing = 'img2img';
  }

  if (opts.extraSourceImagesBase64?.length) {
    body.extra_source_images = opts.extraSourceImagesBase64.map((image) => ({ image }));
  }

  const submitRes = await fetchWithRetry(
    `${baseUrl}/generate/async`,
    { method: 'POST', headers, body: JSON.stringify(body) },
    logger,
  );

  if (!submitRes.ok) {
    const text = await submitRes.text();
    throw new Error(`Stable Horde submit ${submitRes.status}: ${text.slice(0, 300)}`);
  }

  const submitData = (await submitRes.json()) as { id?: string; message?: string };
  const jobId = submitData.id;
  if (!jobId) throw new Error(submitData.message ?? 'Stable Horde: no job id');

  logger.log(`Horde job ${jobId} (${opts.sourceImageBase64 ? 'img2img' : 'txt2img'})...`);

  const pollMs = opts.pollMs ?? 5000;
  const timeoutMs = opts.timeoutMs ?? 900_000;
  const started = Date.now();
  let done = false;

  while (Date.now() - started < timeoutMs) {
    await sleep(pollMs);
    const checkRes = await fetchWithRetry(`${baseUrl}/generate/check/${jobId}`, { headers }, logger);
    if (!checkRes.ok) continue;

    const check = (await checkRes.json()) as { done?: boolean; finished?: number; faulted?: boolean };
    if (check.faulted) throw new Error('Stable Horde: job faulted');
    if (check.done || (check.finished ?? 0) >= 1) {
      done = true;
      break;
    }
  }

  if (!done) throw new Error('Stable Horde: timeout waiting for generation');

  const statusRes = await fetchWithRetry(`${baseUrl}/generate/status/${jobId}`, { headers }, logger);
  if (!statusRes.ok) throw new Error(`Stable Horde status ${statusRes.status}`);

  const status = (await statusRes.json()) as {
    generations?: Array<{ img?: string }>;
    faulted?: boolean;
    message?: string;
  };

  if (status.faulted) throw new Error(status.message ?? 'Stable Horde generation faulted');

  const img = status.generations?.[0]?.img;
  if (!img) throw new Error('Stable Horde: empty image');

  if (img.startsWith('http')) {
    const imgRes = await fetchWithRetry(img, {}, logger);
    if (!imgRes.ok) throw new Error(`Failed to download Horde image: ${imgRes.status}`);
    return Buffer.from(await imgRes.arrayBuffer());
  }

  const base64 = img.replace(/^data:image\/\w+;base64,/, '');
  return Buffer.from(base64, 'base64');
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url: string, init?: RequestInit, logger?: Logger, retries = 4) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastError = err;
      logger?.warn(`Horde fetch retry ${attempt}/${retries}: ${err instanceof Error ? err.message : err}`);
      await sleep(1500 * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Stable Horde network error');
}
