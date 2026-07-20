import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { ImageProvider, ImageGenerationInput } from './image.interface';

@Injectable()
export class StubImageProvider implements ImageProvider {
  async generate(input: ImageGenerationInput): Promise<string> {
    const width = input.width ?? 800;
    const height = input.height ?? 600;

    const lines = [
      'Концепция сувенирного набора',
      '',
      input.prompt.slice(0, 200),
    ];

    const svgText = lines
      .map((line, i) => {
        const y = 80 + i * 36;
        const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<text x="40" y="${y}" font-family="Arial,sans-serif" font-size="22" fill="#1a1a1a">${escaped}</text>`;
      })
      .join('\n');

    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f5f5f5"/>
        <rect x="20" y="20" width="${width - 40}" height="${height - 40}" rx="12" fill="#ffffff" stroke="#7C5CFC" stroke-width="3"/>
        ${svgText}
        <text x="40" y="${height - 40}" font-family="Arial,sans-serif" font-size="14" fill="#888">Сгенерировано MVP · Убийца Сувенирки</text>
      </svg>
    `;

    await sharp(Buffer.from(svg)).png().toFile(input.outputPath);
    return input.outputPath;
  }
}
