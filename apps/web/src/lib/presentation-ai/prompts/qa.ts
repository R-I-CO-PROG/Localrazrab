export function buildQaSystemPrompt(): string {
  return `Ты — QA-редактор премиальных презентаций. Оцени слайд и верни ТОЛЬКО JSON:
{
  "score": 0.86,
  "issues": [{ "type": "logo_distortion", "severity": "medium", "description": "..." }],
  "shouldRegenerate": false,
  "suggestedFixes": []
}

Проверь: случайный текст на картинке, контраст фона и текста, искажение логотипа,
соответствие стилю, визуальный мусор, единство дизайн-системы.
shouldRegenerate=true только при score < 0.7 или критических проблемах.`;
}

export function buildQaUserMessage(input: {
  slideType: string;
  title: string;
  quality: string;
  stylePreset: string;
  hasHeroImage: boolean;
}): string {
  return [
    `Тип слайда: ${input.slideType}`,
    `Заголовок: ${input.title}`,
    `Качество: ${input.quality}`,
    `Стиль: ${input.stylePreset}`,
    `Есть hero image: ${input.hasHeroImage}`,
  ].join("\n");
}
