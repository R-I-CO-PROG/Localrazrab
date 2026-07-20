import type {
  PresentationBenefit,
  PresentationIconKey,
  PresentationSlide,
} from "@/lib/brand-palette";
import { DEFAULT_PRODUCT_ICONS } from "./presentation-icons";
import type { PresentationVisualizationInput } from "./presentation-types";

export interface AgencyProductEntry {
  productName: string;
  price?: number;
  imageUrl?: string;
  conceptName: string;
  description?: string;
  visualizationId?: string;
}

function collectAgencyProducts(
  visualizations: PresentationVisualizationInput[],
): AgencyProductEntry[] {
  const products: AgencyProductEntry[] = [];

  for (const viz of visualizations) {
    if (viz.items?.length) {
      for (const item of viz.items) {
        products.push({
          productName: item.name,
          price: item.price,
          imageUrl: item.imageUrl ?? viz.imageUrl,
          conceptName: viz.conceptName,
          description: item.description ?? viz.description,
          visualizationId: viz.id,
        });
      }
    } else {
      products.push({
        productName: viz.conceptName,
        imageUrl: viz.imageUrl,
        conceptName: viz.conceptName,
        description: viz.description,
        visualizationId: viz.id,
      });
    }
  }

  return products;
}

function defaultBenefits(productName: string): PresentationBenefit[] {
  const templates = [
    { icon: "gift" as PresentationIconKey, title: "Эмоция вручения", text: "Создаёт запоминающийся момент и усиливает лояльность." },
    { icon: "shield" as PresentationIconKey, title: "Качество бренда", text: "Премиальное исполнение отражает ценности вашей компании." },
    { icon: "team" as PresentationIconKey, title: "Для команды и клиентов", text: "Универсален для партнёров, сотрудников и VIP-аудитории." },
    { icon: "star" as PresentationIconKey, title: "Запоминаемость", text: `${productName} остаётся в повседневном использовании после события.` },
  ];
  return templates.map((t, i) => ({
    icon: DEFAULT_PRODUCT_ICONS[i] ?? t.icon,
    title: t.title,
    text: t.text,
  }));
}

/** Короткая agency-структура: cover → overview → product×N → closing (как GTNT×Меркурий) */
export function buildAgencyPresentationSlides(input: {
  title: string;
  prompt: string;
  visualizations: PresentationVisualizationInput[];
  footerLeft?: string;
  footerRight?: string;
}): PresentationSlide[] {
  const { title, prompt, visualizations } = input;
  const products = collectAgencyProducts(visualizations);
  const slides: PresentationSlide[] = [];

  const heroThumbs = [
    ...visualizations.map((v) => v.imageUrl),
    ...products.map((p) => p.imageUrl).filter(Boolean),
  ].filter((url, i, arr): url is string => Boolean(url) && arr.indexOf(url) === i);

  slides.push({
    type: "agencyCover",
    title,
    subtitle: prompt.trim().slice(0, 120) || "Премиальный подарочный комплект под вашу задачу",
    galleryImages: heroThumbs.slice(0, 5),
    footerLeft: input.footerLeft,
    footerRight: input.footerRight,
  });

  slides.push({
    type: "agencyOverview",
    title: "ОБЗОР КОМПЛЕКТА",
    subtitle: `${products.length} ${products.length === 1 ? "позиция" : products.length < 5 ? "позиции" : "позиций"} в единой концепции`,
    body: prompt.trim().slice(0, 280),
    overviewItems: products.map((p) => ({
      name: p.productName,
      icon: "gift",
      thumbUrl: p.imageUrl,
    })),
    imageUrl: visualizations[0]?.imageUrl,
    galleryImages: heroThumbs.slice(0, 4),
  });

  for (const product of products) {
    slides.push({
      type: "agencyProduct",
      productName: product.productName,
      title: product.productName.toUpperCase(),
      subtitle: product.conceptName,
      body: product.description,
      price: product.price,
      imageUrl: product.imageUrl,
      visualizationId: product.visualizationId,
      benefits: defaultBenefits(product.productName),
      footerLeft: input.footerLeft,
      footerRight: input.footerRight,
    });
  }

  slides.push({
    type: "agencyClosing",
    title: "СПАСИБО ЗА ВНИМАНИЕ",
    subtitle: "Готовы обсудить тираж, сроки и финальное согласование",
    body: "Свяжитесь с нами — подготовим коммерческое предложение и запустим производство.",
    bullets: [
      "Согласование состава и брендирования",
      "Пробный образец и контроль качества",
      "Логистика и вручение под ключ",
    ],
    footerLeft: input.footerLeft,
    footerRight: input.footerRight,
  });

  return slides;
}

export function mergeAgencyAiCopyIntoSlides(
  slides: PresentationSlide[],
  copyByIndex: Array<{
    title?: string;
    subtitle?: string;
    body?: string;
    bullets?: string[];
    speakerNotes?: string;
    benefits?: PresentationBenefit[];
    footerLeft?: string;
    footerRight?: string;
    overviewItems?: Array<{ name: string; icon?: PresentationIconKey; thumbUrl?: string }>;
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
      benefits: copy.benefits?.length ? copy.benefits : slide.benefits,
      footerLeft: copy.footerLeft?.trim() || slide.footerLeft,
      footerRight: copy.footerRight?.trim() || slide.footerRight,
      overviewItems: copy.overviewItems?.length ? copy.overviewItems : slide.overviewItems,
    };
  });
}
