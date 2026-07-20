import { Injectable, Logger } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { writeFile } from 'fs/promises';

import { ImageProvider, ImageGenerationInput } from './image.interface';



@Injectable()

export class HuggingFaceImageProvider implements ImageProvider {

  private readonly logger = new Logger(HuggingFaceImageProvider.name);



  constructor(private readonly config: ConfigService) {}



  private async sleep(ms: number) {

    return new Promise((r) => setTimeout(r, ms));

  }



  private buildEndpoints(model: string): string[] {

    const provider = this.config.get<string>('HUGGINGFACE_PROVIDER', 'hf-inference');

    const endpoints: string[] = [];

    // FLUX.1-schnell на fal-ai не поддерживается — сначала hf-inference
    if (provider === 'auto' || provider === 'hf-inference') {
      endpoints.push(`https://router.huggingface.co/hf-inference/models/${model}`);
    }

    if (provider === 'auto' || provider === 'fal-ai') {
      endpoints.push(`https://router.huggingface.co/fal-ai/models/${model}`);
    }

    return [...new Set(endpoints)];

  }



  private permissionHint(status: number, body: string): string {

    if (status !== 403) return body.slice(0, 300);

    return (

      `${body.slice(0, 200)} — создайте fine-grained токен с правом ` +

      '"Make calls to Inference Providers" на https://huggingface.co/settings/tokens'

    );

  }



  async generate(input: ImageGenerationInput): Promise<string> {

    const token = this.config.get<string>('HUGGINGFACE_API_KEY', '').trim();

    if (!token) {

      throw new Error(

        'HUGGINGFACE_API_KEY не задан. Бесплатный токен: https://huggingface.co/settings/tokens',

      );

    }



    const model = this.config.get<string>(

      'HUGGINGFACE_MODEL',

      'black-forest-labs/FLUX.1-schnell',

    );

    const maxRetries = Number(this.config.get('HUGGINGFACE_MAX_RETRIES')) || 8;

    const retryMs = Number(this.config.get('HUGGINGFACE_RETRY_MS')) || 5000;

    const endpoints = this.buildEndpoints(model);



    const promptText = (input.prompt ?? '').trim();
    if (!promptText) {
      throw new Error('HuggingFace: empty prompt — cannot generate');
    }
    const fluxPrompt = promptText.slice(0, 420);

        this.logger.log(`HuggingFace ${model} — prompt (${fluxPrompt.length} chars): ${fluxPrompt.slice(0, 120)}...`);



    const errors: string[] = [];



    for (const url of endpoints) {

      for (let attempt = 1; attempt <= maxRetries; attempt++) {

        const response = await fetch(url, {

          method: 'POST',

          headers: {

            Authorization: `Bearer ${token}`,

            'Content-Type': 'application/json',

            Accept: 'image/png',

          },

          body: JSON.stringify({
            inputs: fluxPrompt,
            parameters: {
              width: input.width ?? 1024,
              height: input.height ?? 1024,
              num_inference_steps: Number(this.config.get('HUGGINGFACE_STEPS')) || 4,
              guidance_scale: Number(this.config.get('HUGGINGFACE_GUIDANCE')) || 0,
            },
          }),

        });



        if (response.status === 503) {

          const body = (await response.json().catch(() => ({}))) as { estimated_time?: number };

          const wait = Math.min((body.estimated_time ?? 10) * 1000, 30000);

          this.logger.log(`Model loading, retry ${attempt}/${maxRetries} in ${wait}ms...`);

          await this.sleep(wait || retryMs);

          continue;

        }



        if (response.status === 403) {

          const text = await response.text();

          errors.push(`HuggingFace 403 (${url}): ${this.permissionHint(403, text)}`);

          break;

        }



        if (!response.ok) {

          const text = await response.text();

          errors.push(`HuggingFace ${response.status} (${url}): ${text.slice(0, 200)}`);

          break;

        }



        const contentType = response.headers.get('content-type') ?? '';

        if (!contentType.includes('image')) {

          const text = await response.text();

          errors.push(`HuggingFace unexpected response (${url}): ${text.slice(0, 200)}`);

          break;

        }



        const buffer = Buffer.from(await response.arrayBuffer());

        await writeFile(input.outputPath, buffer);

        this.logger.log(`HuggingFace image saved (${buffer.length} bytes)`);

        return input.outputPath;

      }

    }



    throw new Error(errors.join(' | ') || 'HuggingFace: model busy after retries');

  }

}


