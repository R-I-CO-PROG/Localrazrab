import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBriefRelevanceContext,
  scoreBriefRelevanceWithContext,
  isMedicalBrief,
} from './catalog-brief-relevance.util';
import { clearProductTypeCache } from '../../concept/product-taxonomy';
import type { CatalogProduct } from './catalog.util';

function p(name: string, category = 'Отдых и спорт', price = 600): CatalogProduct {
  return {
    id: name, name, category, subcategory: null, description: name, price,
    stockAvailable: 100, colors: [], silhouetteImageUrl: '', catalogImageUrl: 'x', imageUrl: 'x',
  } as CatalogProduct;
}
const rel = (name: string, brief: string, cat = 'Отдых и спорт') =>
  scoreBriefRelevanceWithContext(p(name, cat), buildBriefRelevanceContext(brief, []));

const DOCTORS = 'подарки врачам на день медицинского работника';
const FITNESS = 'подарки для фитнес-клуба, спорт и здоровый образ жизни';

describe('Фикс 4: медицинский гейт на fitness-бонус', () => {
  beforeEach(() => clearProductTypeCache());

  it('isMedicalBrief: врач/клиника/стоматолог → true, продажники/фитнес → false', () => {
    assert.equal(isMedicalBrief(buildBriefRelevanceContext(DOCTORS, [])), true);
    assert.equal(isMedicalBrief(buildBriefRelevanceContext('подарки стоматологической клинике', [])), true);
    assert.equal(isMedicalBrief(buildBriefRelevanceContext('наборы для онбординга менеджеров по продажам', [])), false);
    assert.equal(isMedicalBrief(buildBriefRelevanceContext(FITNESS, [])), false);
  });

  it('скакалка врачам НЕ получает fitness-бонус (+40 снят)', () => {
    // тот же товар в фитнес-брифе получает +40; в медицинском — нет.
    const inDoctors = rel('Регулируемая скакалка ROCKY', DOCTORS);
    const inFitness = rel('Регулируемая скакалка ROCKY', FITNESS);
    assert.ok(inFitness - inDoctors >= 35, `ожидали разрыв ~40, получили ${inFitness - inDoctors} (врач ${inDoctors}, фитнес ${inFitness})`);
    assert.ok(inDoctors <= 20, `скакалка врачам не должна быть сильно в плюсе: ${inDoctors}`);
  });

  it('эспандер/спорт-резинка врачам тоже без fitness-буста', () => {
    const inDoctors = rel('Эспандер кистевой спортивный', DOCTORS);
    const inFitness = rel('Эспандер кистевой спортивный', FITNESS);
    assert.ok(inFitness - inDoctors >= 20, `эспандер: разрыв ${inFitness - inDoctors}`);
  });

  it('бутылка для воды врачам СОХРАНЯЕТ health-релевантность (не гейтим)', () => {
    // bottle легитимен для медиков — не в списке гейта, +40 остаётся.
    assert.ok(rel('Бутылка для воды "Ариэль" 600 мл', DOCTORS, 'Термосы и бутылки') >= 30);
  });

  it('фитнес-клубу скакалка ПО-ПРЕЖНЕМУ в плюсе (не медбриф)', () => {
    assert.ok(rel('Регулируемая скакалка ROCKY', FITNESS) >= 35);
  });

  it('антистресс (stress_ball) врачам НЕ получает health-бонус', () => {
    const inDoctors = rel('Антистресс "Авокадо", зеленый', DOCTORS);
    const inFitness = rel('Антистресс "Авокадо", зеленый', FITNESS);
    assert.ok(inFitness - inDoctors >= 35, `антистресс: разрыв ${inFitness - inDoctors} (врач ${inDoctors})`);
  });
});
