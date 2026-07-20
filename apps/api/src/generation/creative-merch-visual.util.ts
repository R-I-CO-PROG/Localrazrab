import type { IdeatorItem } from '../agents/contracts';

/** Жёсткие правила кадра для креативного AI — только физический мерч, не иллюстрация бизнеса клиента */
export const CREATIVE_MERCH_SCENE_GUARDRAILS =
  'MANDATORY: corporate branded MERCHANDISE product photograph — physical gift-set objects only, studio or premium flat lay. ' +
  'Client industry (taxi, bank, IT, logistics) sets MOOD and USE CASE only — NEVER illustrate fleets, vehicles, offices, streets, buildings, or workers as the hero subject. ' +
  'Show ONLY the designed gift items from the concept list. Each item is a real producible object with brand logo applied. ' +
  'Premium welcome-pack or editorial flat lay on neutral/dark studio surface — NOT documentary street photography.';

export const CREATIVE_MERCH_NEGATIVE_EXTRA =
  'taxi, taxi cab, yellow cab, car fleet, street scene, city traffic, vehicles as main subject, automobile, truck, bus, train, airplane, ' +
  'office interior hero, factory, warehouse, people, crowd, documentary photo, stock cityscape, vehicle wrap ad, billboard, ' +
  'illustration of client business instead of products, empty scene without products, random objects not in the set';

export function inferProductTypeFromHint(hint: string): string {
  const h = hint.toLowerCase();
  if (/power\s?bank|повербанк|зарядк|аккумулятор/i.test(h)) return 'powerbank';
  if (/батарончик|батончик|bar|snack|еда|drink|напиток|bottle/i.test(h)) return 'bottle';
  if (/кружк|mug|cup|стакан/i.test(h)) return 'mug';
  if (/блокнот|ежедневник|notebook/i.test(h)) return 'notebook';
  if (/ручк|pen|карандаш/i.test(h)) return 'pen';
  if (/сумк|шоппер|tote|bag/i.test(h)) return 'bag';
  if (/рюкзак|backpack/i.test(h)) return 'backpack';
  if (/термос|thermos/i.test(h)) return 'thermos';
  if (/бутылк|bottle/i.test(h)) return 'bottle';
  if (/футболк|худи|текстил|apparel|одежд/i.test(h)) return 'tshirt';
  if (/кепк|cap|бейсболк/i.test(h)) return 'cap';
  if (/стикер|sticker/i.test(h)) return 'sticker';
  if (/брелок|keychain/i.test(h)) return 'keychain';
  if (/флеш|usb|flash/i.test(h)) return 'flashdrive';
  if (/наушник|headphone/i.test(h)) return 'headphones';
  if (/коробк|gift|набор|box/i.test(h)) return 'giftbox';
  if (/карт[аы]|nfc|пропуск/i.test(h)) return 'card';
  if (/зонт|umbrella/i.test(h)) return 'umbrella';
  return 'accessory';
}

export function creativeProductDisplayName(item: IdeatorItem): string {
  const notes = item.notes?.trim();
  if (notes && notes.length > 8) return notes.slice(0, 120);
  const type = item.productType?.trim();
  return type || 'branded merch item';
}

export function formatCreativeProductList(items: IdeatorItem[]): string {
  const names = items.map(creativeProductDisplayName).filter(Boolean);
  if (names.length === 0) return '';
  return `Exactly ${names.length} physical branded products in frame (all visible, no substitutes): ${names.join('; ')}.`;
}

export function mapProductRolesToItems(
  idea: {
    items?: IdeatorItem[];
    productRoles?: Array<{ role?: string; categoryHint?: string }>;
  },
): IdeatorItem[] {
  const fromItems = (idea.items ?? []).filter((i) => i?.productType);
  if (fromItems.length > 0) return fromItems;

  return (idea.productRoles ?? [])
    .filter((r) => r?.categoryHint?.trim() || r?.role?.trim())
    .map((r) => {
      const hint = [r.categoryHint, r.role].filter(Boolean).join(' — ');
      return {
        productType: inferProductTypeFromHint(hint),
        notes: hint.slice(0, 120),
        priority: 'must' as const,
      };
    });
}
