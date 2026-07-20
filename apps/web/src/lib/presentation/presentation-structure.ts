import type { PresentationSlide } from "@/lib/brand-palette";
import type { PresentationVisualizationInput } from "./presentation-types";

const PRODUCTS_PER_SLIDE = 4;
const GRID_IMAGES = 4;

function conceptLabel(index: number): string {
  const labels = ["Первый", "Второй", "Третий", "Четвёртый", "Пятый"];
  return labels[index] ?? `${index + 1}-й`;
}

function productImages(viz: PresentationVisualizationInput): string[] {
  return (viz.items ?? [])
    .map((item) => item.imageUrl)
    .filter((url): url is string => Boolean(url));
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Профессиональная структура дека — storytelling + витрины товаров */
export function buildPremiumPresentationSlides(input: {
  title: string;
  prompt: string;
  visualizations: PresentationVisualizationInput[];
}): PresentationSlide[] {
  const { title, prompt, visualizations } = input;
  const count = visualizations.length;
  const slides: PresentationSlide[] = [];

  slides.push({
    type: "title",
    title,
    subtitle: "Концепции подарочных наборов",
    body: "подарок, который запоминается и работает после вручения",
  });

  slides.push({
    type: "insight",
    title: "Большинство подарков не несут смысла и не создают эмоции",
    subtitle: "80% корпоративных подарков забываются в первые 24 часа",
    imageUrl: visualizations[0]?.imageUrl,
  });

  slides.push({
    type: "insight",
    title: "Инсайт",
    subtitle: "Запоминаются не предметы, а моменты и смыслы — эмоции от подарка",
    body: prompt.trim().slice(0, 220),
    imageUrl: visualizations[0]?.imageUrl,
  });

  slides.push({
    type: "insight",
    title: "Каждый набор — это эмоция",
    subtitle: "Мы превращаем подарок в ритуал и опыт",
    imageUrl: visualizations[0]?.imageUrl,
  });

  if (count > 1) {
    slides.push({
      type: "conceptsIntro",
      title: `${count} концепции`,
      bullets: [
        `${count} сценария использования`,
        `${count} эмоции`,
        `${count} решения под задачу`,
      ],
      imageUrl: visualizations[0]?.imageUrl,
    });
  }

  visualizations.forEach((viz, index) => {
    const imgs = productImages(viz);
    const tagline =
      viz.description?.trim() ||
      "Решение, которое усиливает бренд и оставляет впечатление";

    slides.push({
      type: "section",
      title: `${conceptLabel(index)} концепт`,
      subtitle: viz.conceptName,
    });

    slides.push({
      type: "visualization",
      title: viz.conceptName,
      subtitle: tagline,
      body: viz.description,
      imageUrl: viz.imageUrl,
      visualizationId: viz.id,
    });

    slides.push({
      type: "conceptShowcase",
      title: `${conceptLabel(index)} концепт`,
      subtitle: tagline,
      imageUrl: viz.imageUrl,
      galleryImages: imgs.slice(0, 2),
      visualizationId: viz.id,
    });

    const gridPool = imgs.length ? imgs : [viz.imageUrl];
    for (const part of chunk(gridPool, GRID_IMAGES)) {
      const filled = [...part];
      while (filled.length < GRID_IMAGES && filled.length > 0) {
        filled.push(filled[filled.length % filled.length]);
      }
      slides.push({
        type: "conceptGrid",
        title: viz.conceptName,
        subtitle: "Детали набора",
        galleryImages: filled,
        visualizationId: viz.id,
      });
    }

    slides.push({
      type: "howItWorks",
      title: "Как это работает",
      body:
        viz.description ??
        "Набор создан под вашу задачу: каждый предмет работает на узнаваемость бренда и усиливает впечатление от вручения.",
      subtitle: "Подарок фиксирует момент и оставляет след в коммуникации с клиентом или командой.",
      imageUrl: viz.imageUrl,
      visualizationId: viz.id,
    });

    slides.push({
      type: "quote",
      title: "Это не подарок",
      subtitle: "Это инструмент впечатлений",
      imageUrl: imgs[0] ?? viz.imageUrl,
      visualizationId: viz.id,
    });

    if (viz.items?.length) {
      for (const productChunk of chunk(viz.items, PRODUCTS_PER_SLIDE)) {
        slides.push({
          type: "products",
          title: `Состав набора · ${viz.conceptName}`,
          products: productChunk,
          visualizationId: viz.id,
        });
      }
    }
  });

  slides.push({
    type: "summary",
    title: "Итоги",
    body: prompt.trim().slice(0, 280),
    bullets: [
      `Подобрано ${count} ${count === 1 ? "концепция" : "концепции"} под вашу задачу`,
      "Визуализации готовы к согласованию и презентации руководству",
      "Гибкая корректировка состава, тиража и брендирования",
    ],
  });

  slides.push({
    type: "closing",
    title: "Спасибо за внимание",
    body: "Готовы обсудить детали, сроки и перейти к производству.",
    bullets: ["Свяжитесь с нами для уточнения тиража и финального согласования"],
  });

  return slides;
}

export function mergeAiCopyIntoSlides(
  slides: PresentationSlide[],
  copyByIndex: Array<{
    title?: string;
    subtitle?: string;
    body?: string;
    bullets?: string[];
    speakerNotes?: string;
  }>,
): PresentationSlide[] {
  return slides.map((slide, index) => {
    const copy = copyByIndex[index];
    if (!copy) return slide;
    return {
      ...slide,
      title: copy.title?.trim() || slide.title,
      subtitle: copy.subtitle?.trim() || slide.subtitle,
      body: copy.body?.trim() || slide.body,
      bullets: copy.bullets?.filter(Boolean).length ? copy.bullets : slide.bullets,
      speakerNotes: copy.speakerNotes?.trim() || slide.speakerNotes,
    };
  });
}
