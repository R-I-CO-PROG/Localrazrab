/** Соотношения, которые принимает Gemini image_config.aspect_ratio */
const SUPPORTED: Array<{ label: string; value: number }> = [
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '3:2', value: 3 / 2 },
  { label: '2:3', value: 2 / 3 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
];

/** Ближайшее поддерживаемое соотношение к реальным пропорциям фото */
export function aspectRatioFromSize(width: number, height: number): string {
  if (!width || !height) return '1:1';
  const ratio = width / height;
  let best = SUPPORTED[0];
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const candidate of SUPPORTED) {
    const delta = Math.abs(Math.log(ratio / candidate.value));
    if (delta < bestDelta) {
      bestDelta = delta;
      best = candidate;
    }
  }
  return best.label;
}
