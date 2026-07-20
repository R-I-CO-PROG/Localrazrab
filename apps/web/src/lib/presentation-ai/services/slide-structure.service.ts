import type {
  ConceptSlideOutline,
  PresentationConcept,
  ProductInput,
  SlideLayout,
  SlideType,
} from "../types";

/**
 * Post-processes a slide outline to attach, on every collection_overview slide, the
 * product ids and source visualization it actually introduces — inferred from the
 * contiguous run of "product" slides that follow it. Needed because the LLM-authored
 * concept.slides array may order overview/product groups differently than the input
 * visualizations array, so blind positional (index-based) matching silently mixes up
 * which group's items/photo belongs to which overview slide.
 */
/**
 * Guarantees exactly one collection_overview slide per distinct product category, in the
 * order those categories first appear among the product slides — regardless of how many
 * (if any) collection_overview slides the LLM actually produced. The LLM is not reliably
 * compliant about "one overview per group", which previously caused a single overview slide
 * to silently swallow items from every visualization when there should have been several.
 * Product slide order/content is left untouched (only overview slides are normalized).
 */
function ensureOverviewPerGroup(
  slides: ConceptSlideOutline[],
  products: ProductInput[],
): ConceptSlideOutline[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const productSlides = slides.filter((s) => s.type === "product" && s.productId && byId.has(s.productId));

  const categoryOrder: string[] = [];
  const groups = new Map<string, ConceptSlideOutline[]>();
  for (const s of productSlides) {
    const cat = byId.get(s.productId!)!.category?.trim() || "Набор";
    if (!groups.has(cat)) {
      groups.set(cat, []);
      categoryOrder.push(cat);
    }
    groups.get(cat)!.push(s);
  }

  if (groups.size <= 1) return slides;

  const cover = slides.find((s) => s.type === "cover");
  const thankYou = slides.filter((s) => s.type === "thank_you");
  const others = slides.filter(
    (s) => s.type !== "cover" && s.type !== "thank_you" && s.type !== "product" && s.type !== "collection_overview",
  );
  const existingOverviews = slides.filter((s) => s.type === "collection_overview");

  const rebuilt: ConceptSlideOutline[] = [];
  if (cover) rebuilt.push(cover);
  categoryOrder.forEach((cat, i) => {
    const existing = existingOverviews[i];
    rebuilt.push({
      type: "collection_overview",
      title: existing?.title ?? cat,
      subtitle: existing?.subtitle ?? "Состав набора",
      layout: "collection_overview",
    });
    rebuilt.push(...groups.get(cat)!);
  });
  rebuilt.push(...others);
  rebuilt.push(...thankYou);
  return rebuilt;
}

function attachGroupMetadata(
  slides: ConceptSlideOutline[],
  products: ProductInput[],
): ConceptSlideOutline[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const result = [...slides];
  for (let i = 0; i < result.length; i++) {
    if (result[i].type !== "collection_overview") continue;
    const groupProductIds: string[] = [];
    for (let j = i + 1; j < result.length; j++) {
      const s = result[j];
      if (s.type === "product" && s.productId) {
        groupProductIds.push(s.productId);
      } else if (s.type === "collection_overview" || s.type === "thank_you") {
        break;
      }
    }
    const firstProduct = groupProductIds.length ? byId.get(groupProductIds[0]) : undefined;
    result[i] = {
      ...result[i],
      groupProductIds,
      sourceVisualizationId: firstProduct?.sourceVisualizationId,
    };
  }
  return result;
}

function layoutForType(type: SlideType, index: number): SlideLayout {
  switch (type) {
    case "cover":
      return "cover";
    case "collection_overview":
      return "collection_overview";
    case "product":
      return "product_left_image_right_text";
    case "thank_you":
      return "thank_you";
    default:
      return "product_left_image_right_text";
  }
}

export function buildDefaultSlideStructure(input: {
  brandName: string;
  products: ProductInput[];
  occasion?: string;
  slideCount?: number;
}): ConceptSlideOutline[] {
  const { products, brandName, occasion } = input;
  const slides: ConceptSlideOutline[] = [];

  const occasionLabel = occasion ?? "корпоративных подарков";
  // Обложка = логотип клиента + приветствие (нейтрально-деловой тон).
  slides.push({
    type: "cover",
    title: brandName,
    subtitle: `Коллекция ${occasionLabel}`,
    caption: "Корпоративные подарки для клиентов и партнёров",
    layout: "cover",
  });

  // Группируем товары по КОНЦЕПЦИИ (adapter кладёт conceptName в category). Для каждой
  // концепции: её слайд-обложка (получит визуализацию этой концепции) + ЕЁ товары с ценами.
  // Товары разных концепций не смешиваются.
  const groups = new Map<string, ProductInput[]>();
  for (const p of products) {
    const key = p.category?.trim() || "Набор";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  const multi = groups.size > 1;

  for (const [conceptName, groupProducts] of groups) {
    slides.push({
      type: "collection_overview",
      title: multi ? conceptName : `Коллекция ${occasionLabel}`,
      subtitle: "Состав набора",
      layout: "collection_overview",
    });
    for (const product of groupProducts) {
      slides.push({
        type: "product",
        productId: product.id,
        title: product.name,
        subtitle: product.description?.slice(0, 80) ?? product.category ?? "",
        layout: layoutForType("product", slides.length),
      });
    }
  }

  slides.push({
    type: "thank_you",
    title: "Спасибо за внимание",
    subtitle: "Готовы обсудить тираж и сроки",
    layout: "thank_you",
  });

  return slides;
}

export function mergeConceptWithStructure(
  concept: PresentationConcept,
  products: ProductInput[],
): ConceptSlideOutline[] {
  const rawSlides =
    concept.slides.length >= 3
      ? concept.slides.map((slide, i) => ({
          ...slide,
          layout: (slide.layout as SlideLayout) ?? layoutForType(slide.type, i),
        }))
      : buildDefaultSlideStructure({
          brandName: concept.presentationTitle.split(" ")[0] ?? "Brand",
          products,
          slideCount: concept.slides.length,
        });
  const slides = ensureOverviewPerGroup(rawSlides, products);
  return attachGroupMetadata(slides, products);
}
