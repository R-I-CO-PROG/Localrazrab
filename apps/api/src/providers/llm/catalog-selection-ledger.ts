import type { CatalogProduct } from './catalog.util';
import {
  registerCrossConceptBlock,
  crossConceptLineKeys,
  isVariantBlocked,
  productBaseNameKey,
  productVariantKey,
} from './catalog-variant.util';
import { detectConceptProductType } from './concept-diversity.util';
import { familyForType } from '../../concept/product-taxonomy';

/**
 * Единый глобальный реестр уже использованного на ВСЕ N наборов прогона.
 * Применяется во время выбора (не пост-фактум) — в корне убивает
 * sku-dup / base-dup / variant-dup / line-dup / role-dup между наборами.
 *
 * Тонкая обёртка над существующими cross-concept утилитами — никакой новой
 * логики дедупа, только удобный фасад для нейро-селектора.
 */
export class SelectionLedger {
  private ids: Set<string>;
  private variants: Set<string>;
  private lineKeys: Set<string>;
  /** Базовые имена (без цвета) — ловит base-dup, который проскакивает мимо variantKey
   *  (externalId кодирует цвет словами, а тире-суффикс не стрипался). */
  private baseNames = new Set<string>();
  /** Обязательные типы брифа: освобождены от line-key блокировки (см. canUse). */
  private mandatorySlugs = new Set<string>();
  /** Счётчик ссылок на ключ (namespaced v:/l:/b:) — для безопасного release при свопах. */
  private keyRefs = new Map<string, number>();
  /** Ключи, зарезервированные конкретным товаром (по id) — чтобы точно их снять при release. */
  private itemKeys = new Map<string, string[]>();
  /** Seed-ключи прошлых наборов — «пиннятся», release их НИКОГДА не удаляет. */
  private pinnedKeys = new Set<string>();

  constructor(
    seedIds: Set<string> = new Set(),
    seedVariants: Set<string> = new Set(),
    seedLineKeys: Set<string> = new Set(),
    private readonly brief = '',
  ) {
    this.ids = seedIds;
    this.variants = seedVariants;
    this.lineKeys = seedLineKeys;
    for (const v of seedVariants) this.pinnedKeys.add(`v:${v}`);
    for (const lk of seedLineKeys) this.pinnedKeys.add(`l:${lk}`);
  }

  /** Все namespaced-ключи, которые reserve(p) добавляет в реестр (для refcount/release). */
  private reservationKeys(p: CatalogProduct): string[] {
    const variantSet = new Set<string>();
    registerCrossConceptBlock(p, new Set<string>(), variantSet); // собираем ТОЛЬКО variant-ключи p
    const keys: string[] = [];
    for (const v of variantSet) keys.push(`v:${v}`);
    for (const lk of crossConceptLineKeys(p, this.brief)) keys.push(`l:${lk}`);
    const base = productBaseNameKey(p);
    if (base.length >= 6) keys.push(`b:${base}`);
    return [...new Set(keys)];
  }

  /** Обязательные типы брифа — им нужен экземпляр в КАЖДОМ наборе прогона. */
  setMandatoryTypes(slugs: string[]): void {
    this.mandatorySlugs = new Set(slugs);
  }

  /** Можно ли вообще использовать товар (не занят другим набором / линейкой / базовой моделью). */
  canUse(p: CatalogProduct): boolean {
    if (this.ids.has(p.id)) return false;
    // ОБЯЗАТЕЛЬНЫЙ тип брифа нужен в КАЖДОМ наборе, а line-key бывает уровня БРЕНДА
    // ('rombica' регистрируется в variants через registerCrossConceptBlock) — он выключал
    // бы ВСЕ проекторы каталога после первого набора. Для mandatory оставляем только
    // ТОЧНЫЕ блокировки (id/вариант/базовая модель): один SKU не повторится, модель меняется.
    if (this.mandatorySlugs.size && this.mandatorySlugs.has(detectConceptProductType(p))) {
      if (this.variants.has(productVariantKey(p))) return false;
      const mandBase = productBaseNameKey(p);
      return !(mandBase.length >= 6 && this.baseNames.has(mandBase));
    }
    if (isVariantBlocked(p, this.ids, this.variants)) return false;
    const base = productBaseNameKey(p);
    if (base.length >= 6 && this.baseNames.has(base)) return false;
    return !crossConceptLineKeys(p, this.brief).some((lk) => this.lineKeys.has(lk));
  }

  /** Дублирует ли товар роль/семейство уже принятых в ТЕКУЩИЙ набор позиций. */
  wouldDupeRole(p: CatalogProduct, currentSet: CatalogProduct[]): boolean {
    const fam = familyForType(detectConceptProductType(p));
    return currentSet.some(
      (q) => familyForType(detectConceptProductType(q)) === fam,
    );
  }

  /** Резервирует товар: id + variant + line-keys → больше не выдаётся. */
  reserve(p: CatalogProduct): void {
    registerCrossConceptBlock(p, this.ids, this.variants);
    for (const lk of crossConceptLineKeys(p, this.brief)) {
      this.lineKeys.add(lk);
    }
    const base = productBaseNameKey(p);
    if (base.length >= 6) this.baseNames.add(base);
    // refcount: запоминаем ключи товара и наращиваем счётчики (для последующего release).
    const keys = this.reservationKeys(p);
    this.itemKeys.set(p.id, keys);
    for (const k of keys) this.keyRefs.set(k, (this.keyRefs.get(k) ?? 0) + 1);
  }

  /**
   * Освобождает товар, выброшенный свопом (2.6/3b/4b), — иначе его id/variant/line/base
   * оставались бы заблокированными на все последующие наборы, хотя товар нигде не использован.
   * Безопасно: ключ снимается ТОЛЬКО когда на него не осталось ссылок и он не seed (pinned).
   * Замена (reserve нового товара) после release восстановит общие с ним ключи.
   */
  release(p: CatalogProduct): void {
    this.ids.delete(p.id);
    const keys = this.itemKeys.get(p.id);
    if (!keys) return;
    this.itemKeys.delete(p.id);
    for (const k of keys) {
      const n = (this.keyRefs.get(k) ?? 0) - 1;
      if (n > 0) { this.keyRefs.set(k, n); continue; }
      this.keyRefs.delete(k);
      if (this.pinnedKeys.has(k)) continue; // seed прошлых наборов — не трогаем
      if (k.startsWith('v:')) this.variants.delete(k.slice(2));
      else if (k.startsWith('l:')) this.lineKeys.delete(k.slice(2));
      else if (k.startsWith('b:')) this.baseNames.delete(k.slice(2));
    }
  }

  /** Снимок занятых id (для отладки/логов). */
  snapshotUsedIds(): Set<string> {
    return new Set(this.ids);
  }
}
