import { existsSync } from 'fs';
import { copyFile, writeFile } from 'fs/promises';
import { basename } from 'path';

async function downloadRemoteImage(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) {
    throw new Error(`Failed to download image (${res.status}): ${url.slice(0, 120)}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/** Локальный /uploads/... или скачивание по https */
export async function persistGenerationResultImage(
  generatedOutput: string,
  outputPath: string,
): Promise<string> {
  const filename = basename(outputPath);

  if (generatedOutput.startsWith('/uploads/')) {
    return generatedOutput;
  }

  if (existsSync(outputPath)) {
    return `/uploads/generated/${filename}`;
  }

  if (/^https?:\/\//i.test(generatedOutput)) {
    const buf = await downloadRemoteImage(generatedOutput);
    await writeFile(outputPath, buf);
    return `/uploads/generated/${filename}`;
  }

  if (generatedOutput !== outputPath && existsSync(generatedOutput)) {
    await copyFile(generatedOutput, outputPath);
  } else if (!existsSync(outputPath) && existsSync(generatedOutput)) {
    await copyFile(generatedOutput, outputPath);
  }

  if (!existsSync(outputPath)) {
    throw new Error(`Generated image file missing: ${outputPath}`);
  }

  return `/uploads/generated/${filename}`;
}
