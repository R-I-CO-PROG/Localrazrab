import { Injectable, Logger } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { writeFile } from 'fs/promises';

import { ImageProvider, ImageGenerationInput } from './image.interface';



@Injectable()

export class StableHordeImageProvider implements ImageProvider {

  private readonly logger = new Logger(StableHordeImageProvider.name);



  constructor(private readonly config: ConfigService) {}



  private headers() {

    const apiKey = this.config.get<string>('STABLE_HORDE_API_KEY', '0000000000');

    const clientAgent = this.config.get<string>(

      'STABLE_HORDE_CLIENT_AGENT',

      'suvenir-mvp:1.0:local-dev',

    );

    return {

      'Content-Type': 'application/json',

      apikey: apiKey,

      'Client-Agent': clientAgent,

    };

  }



  private async fetchWithRetry(url: string, init?: RequestInit, retries = 4): Promise<Response> {

    let lastError: unknown;

    for (let attempt = 1; attempt <= retries; attempt++) {

      try {

        return await fetch(url, init);

      } catch (err) {

        lastError = err;

        const msg = err instanceof Error ? err.message : String(err);

        this.logger.warn(`Horde fetch retry ${attempt}/${retries}: ${msg}`);

        await new Promise((r) => setTimeout(r, 1500 * attempt));

      }

    }

    throw lastError instanceof Error ? lastError : new Error('Stable Horde network error');

  }



  /** Анонимный Horde: max 576×576, max 50 steps */

  private resolveDimensions(input: ImageGenerationInput) {

    const maxSize = Number(this.config.get('STABLE_HORDE_MAX_SIZE')) || 576;

    const defaultW = Number(this.config.get('STABLE_HORDE_WIDTH')) || 512;

    const defaultH = Number(this.config.get('STABLE_HORDE_HEIGHT')) || 512;



    let width = input.width ?? defaultW;

    let height = input.height ?? defaultH;

    width = Math.min(width, maxSize);

    height = Math.min(height, maxSize);

    width = Math.max(64, Math.floor(width / 64) * 64);

    height = Math.max(64, Math.floor(height / 64) * 64);

    return { width, height };

  }



  async generate(input: ImageGenerationInput): Promise<string> {

    const baseUrl = this.config.get<string>(

      'STABLE_HORDE_API_URL',

      'https://aihorde.net/api/v2',

    );

    const modelSetting = this.config.get<string>('STABLE_HORDE_MODEL', 'any');

    const { width, height } = this.resolveDimensions(input);

    const steps = Math.min(Number(this.config.get('STABLE_HORDE_STEPS')) || 20, 50);

    const pollMs = Number(this.config.get('STABLE_HORDE_POLL_MS')) || 5000;

    const timeoutMs = Number(this.config.get('STABLE_HORDE_TIMEOUT_MS')) || 900_000;



    const negative = input.negativePrompt || 'blurry, text, watermark, low quality';

    const prompt = `${input.prompt} ### ${negative}`;



    const body: Record<string, unknown> = {

      prompt,

      params: {

        width,

        height,

        steps,

        cfg_scale: 7,

        sampler_name: 'k_euler_a',

        karras: true,

      },

      nsfw: false,

      censor_nsfw: true,

      trusted_workers: false,

      slow_workers: true,

      r2: true,

    };



    if (modelSetting && modelSetting !== 'any') {

      body.models = [modelSetting];

    }



    this.logger.log(

      `Stable Horde submit (${width}x${height}, steps=${steps}, model=${modelSetting || 'any'})...`,

    );



    const submitRes = await this.fetchWithRetry(`${baseUrl}/generate/async`, {

      method: 'POST',

      headers: this.headers(),

      body: JSON.stringify(body),

    });



    if (!submitRes.ok) {

      const text = await submitRes.text();

      throw new Error(`Stable Horde submit ${submitRes.status}: ${text.slice(0, 300)}`);

    }



    const submitData = (await submitRes.json()) as { id?: string; message?: string };

    const jobId = submitData.id;

    if (!jobId) {

      throw new Error(submitData.message ?? 'Stable Horde: no job id');

    }



    this.logger.log(`Stable Horde job ${jobId}, polling (timeout ${Math.round(timeoutMs / 60000)} min)...`);

    const started = Date.now();

    let done = false;

    let lastQueue = 0;



    while (Date.now() - started < timeoutMs) {

      await new Promise((r) => setTimeout(r, pollMs));



      const checkRes = await this.fetchWithRetry(`${baseUrl}/generate/check/${jobId}`, {

        headers: this.headers(),

      });

      if (!checkRes.ok) continue;



      const check = (await checkRes.json()) as {

        done?: boolean;

        finished?: number;

        waiting?: number;

        queue_position?: number;

        faulted?: boolean;

        wait_time?: number;

      };



      if (check.faulted) {

        throw new Error('Stable Horde: job faulted in queue');

      }



      lastQueue = check.queue_position ?? check.waiting ?? lastQueue;

      if (check.done || (check.finished ?? 0) >= 1) {

        done = true;

        break;

      }



      const elapsed = Math.round((Date.now() - started) / 1000);

      const eta = check.wait_time ? `~${Math.round(check.wait_time / 60)} min` : '';

      this.logger.log(`Horde queue: #${lastQueue} ${eta}, ${elapsed}s elapsed`);

    }



    if (!done) {

      throw new Error(

        `Stable Horde: timeout after ${Math.round(timeoutMs / 60000)} min (queue #${lastQueue}). Попробуйте позже или добавьте HUGGINGFACE_API_KEY.`,

      );

    }



    const statusRes = await this.fetchWithRetry(`${baseUrl}/generate/status/${jobId}`, {

      headers: this.headers(),

    });

    if (!statusRes.ok) {

      throw new Error(`Stable Horde status ${statusRes.status}`);

    }



    const status = (await statusRes.json()) as {

      generations?: Array<{ img?: string }>;

      faulted?: boolean;

      message?: string;

    };



    if (status.faulted) {

      throw new Error(status.message ?? 'Stable Horde generation faulted');

    }



    const img = status.generations?.[0]?.img;

    if (!img) {

      throw new Error('Stable Horde: empty image in response');

    }



    if (img.startsWith('http')) {

      const imgRes = await this.fetchWithRetry(img);

      if (!imgRes.ok) throw new Error(`Failed to download Horde image: ${imgRes.status}`);

      const buffer = Buffer.from(await imgRes.arrayBuffer());

      await writeFile(input.outputPath, buffer);

    } else {

      const base64 = img.replace(/^data:image\/\w+;base64,/, '');

      await writeFile(input.outputPath, Buffer.from(base64, 'base64'));

    }



    this.logger.log(`Stable Horde image saved to ${input.outputPath}`);

    return input.outputPath;

  }

}


