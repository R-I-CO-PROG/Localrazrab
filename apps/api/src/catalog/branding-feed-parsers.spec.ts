import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOasisAreaToMm2,
  parseOasisProduct,
  parseMidoceanProductBlock,
  parseArt24ItemBlock,
  isTextileMaterial,
  refineMethodByMaterial,
} from './branding-feed-parsers';

describe('parseOasisAreaToMm2', () => {
  it('«до 609.00 см²» → 60900 мм²', () => {
    assert.equal(parseOasisAreaToMm2('до 609.00 см²'), 60900);
  });
  it('«до 5 см2» → 500 мм²', () => {
    assert.equal(parseOasisAreaToMm2('до 5 см2'), 500);
  });
  it('мусор → null', () => {
    assert.equal(parseOasisAreaToMm2('по запросу'), null);
    assert.equal(parseOasisAreaToMm2(''), null);
  });
});

describe('parseOasisProduct', () => {
  const product = {
    id: '00000000006',
    article: '514209',
    attributes: [
      { dim: 'г.', name: 'Вес', value: '1570' },
      { id: 1000000002, name: 'Материал товара', value: 'дерево' },
      { id: 1000000008, name: 'Метод нанесения', value: 'Гравировка (CO2 лазер)' },
      { id: 1000000008, name: 'Метод нанесения', value: 'Шильд спектрум' },
    ],
    included_branding: [
      {
        id: '1-000060417',
        name: 'Гравировка (CO2 лазер) (Без чернения)',
        size: 'до 609.00 см²',
        place: 'на обложке альбома',
        setup: 2700,
      },
    ],
  };

  it('ключ — article, источник oasis', () => {
    const r = parseOasisProduct(product)!;
    assert.equal(r.sourceId, 'oasis');
    assert.equal(r.externalId, '514209');
  });

  it('материал из attributes', () => {
    assert.equal(parseOasisProduct(product)!.material, 'дерево');
  });

  it('зона с площадью, методом и setup', () => {
    const z = parseOasisProduct(product)!.zones.find((x) => x.zoneName === 'на обложке альбома')!;
    assert.equal(z.methodCode, 'LASER_ENGRAVING');
    assert.equal(z.maxAreaMm2, 60900);
    assert.equal(z.setupCost, 2700);
    assert.equal(z.maxWidthMm, null);
  });

  it('методы из attributes добавляются как зоны без названия', () => {
    const zones = parseOasisProduct(product)!.zones;
    const plate = zones.find((z) => z.methodCode === 'METAL_PLATE')!;
    assert.equal(plate.zoneName, null);
    assert.equal(plate.methodRaw, 'Шильд спектрум');
  });

  it('товар без нанесения и без материала → null', () => {
    assert.equal(parseOasisProduct({ article: '1', attributes: [], included_branding: [] }), null);
  });
});

describe('parseMidoceanProductBlock', () => {
  const block = `
    <code>AR1470-01</code>
    <material>Полиэстер</material>
    <print_options>
      <print_option>
        <position>FRONT POCKET</position>
        <printable_width>140</printable_width>
        <printable_height>120</printable_height>
        <image>https://printposition-images-api.cdn.midocean.com/AR1470-01_POS1.jpg</image>
        <print_techniques>
          <print_technique><name>Шелкотрафаретная печать</name><max_colors>1</max_colors></print_technique>
        </print_techniques>
      </print_option>
      <print_option>
        <position>TOP</position>
        <printable_width>190</printable_width>
        <printable_height>100</printable_height>
        <print_techniques>
          <print_technique><name>Термоперенос</name><max_colors>8</max_colors></print_technique>
          <print_technique><name>Transfer Reflective</name><max_colors>1</max_colors></print_technique>
        </print_techniques>
      </print_option>
    </print_options>`;

  it('ключ — code', () => {
    const r = parseMidoceanProductBlock(block)!;
    assert.equal(r.sourceId, 'midocean');
    assert.equal(r.externalId, 'AR1470-01');
    assert.equal(r.material, 'Полиэстер');
  });

  it('одна строка на каждую пару зона×метод', () => {
    assert.equal(parseMidoceanProductBlock(block)!.zones.length, 3);
  });

  it('размеры в мм, площадь производная, картинка зоны сохранена', () => {
    const z = parseMidoceanProductBlock(block)!.zones[0];
    assert.equal(z.zoneName, 'FRONT POCKET');
    assert.equal(z.maxWidthMm, 140);
    assert.equal(z.maxHeightMm, 120);
    assert.equal(z.maxAreaMm2, 16800);
    assert.equal(z.maxColors, 1);
    assert.equal(z.zoneImageUrl, 'https://printposition-images-api.cdn.midocean.com/AR1470-01_POS1.jpg');
  });

  it('зона без картинки → zoneImageUrl null', () => {
    assert.equal(parseMidoceanProductBlock(block)!.zones[1].zoneImageUrl, null);
  });

  it('неизвестный метод сохраняется как UNKNOWN с сырым названием', () => {
    const z = parseMidoceanProductBlock(block)!.zones.find((x) => x.methodRaw === 'Transfer Reflective')!;
    assert.equal(z.methodCode, 'UNKNOWN');
  });

  it('блок без print_options → null', () => {
    assert.equal(parseMidoceanProductBlock('<code>X1</code>'), null);
  });

  it('материал текстильный переопределяет SCREEN_PRINT_HARD на SCREEN_PRINT_TEXTILE (Полиэстер + Шелкотрафаретная печать)', () => {
    const z = parseMidoceanProductBlock(block)!.zones[0];
    assert.equal(z.methodRaw, 'Шелкотрафаретная печать');
    assert.equal(z.methodCode, 'SCREEN_PRINT_TEXTILE');
  });
});

describe('parseArt24ItemBlock', () => {
  const block = `
    <sku>NE1882S147</sku>
    <attr_900_key name="Виды нанесений">Гравировка Круговая - CO2, УФ-печать А2, УФ-Лак</attr_900_key>`;

  it('методы через запятую, зон нет', () => {
    const r = parseArt24ItemBlock(block)!;
    assert.equal(r.sourceId, 'art24');
    assert.equal(r.externalId, 'NE1882S147');
    assert.equal(r.material, null);
    assert.equal(r.zones.length, 3);
    assert.deepEqual(
      r.zones.map((z) => z.methodCode),
      ['LASER_ENGRAVING', 'UV_PRINT', 'UV_PRINT'],
    );
    assert.ok(r.zones.every((z) => z.zoneName === null && z.maxWidthMm === null));
  });

  it('блок без «Виды нанесений» → null', () => {
    assert.equal(parseArt24ItemBlock('<sku>X</sku>'), null);
  });
});

describe('isTextileMaterial', () => {
  it('«Хлопок 100%» → true', () => {
    assert.equal(isTextileMaterial('Хлопок 100%'), true);
  });
  it('«металл» → false', () => {
    assert.equal(isTextileMaterial('металл'), false);
  });
  it('null → false', () => {
    assert.equal(isTextileMaterial(null), false);
  });
  it('undefined → false', () => {
    assert.equal(isTextileMaterial(undefined), false);
  });
  it('«» → false', () => {
    assert.equal(isTextileMaterial(''), false);
  });
  it('регистронезависимо и по всем ключевым словам (текстиль/ткань/полиэстер/фетр/трикотаж/лён/лен/джерси/флис)', () => {
    assert.equal(isTextileMaterial('ТЕКСТИЛЬ'), true);
    assert.equal(isTextileMaterial('плотная ткань'), true);
    assert.equal(isTextileMaterial('Полиэстер 600D'), true);
    assert.equal(isTextileMaterial('фетр'), true);
    assert.equal(isTextileMaterial('трикотаж'), true);
    assert.equal(isTextileMaterial('лён'), true);
    assert.equal(isTextileMaterial('лен'), true);
    assert.equal(isTextileMaterial('джерси'), true);
    assert.equal(isTextileMaterial('флис'), true);
  });
  it('«лён»-подобные подстроки внутри других слов не матчатся (клён/клен/полено)', () => {
    assert.equal(isTextileMaterial('Клён'), false);
    assert.equal(isTextileMaterial('клен'), false);
    assert.equal(isTextileMaterial('полено'), false);
  });
  it('«лён»/«лен» матчатся как целое слово', () => {
    assert.equal(isTextileMaterial('лён'), true);
    assert.equal(isTextileMaterial('лен'), true);
    assert.equal(isTextileMaterial('Лён 100%'), true);
    assert.equal(isTextileMaterial('хлопок/лен'), true);
  });
});

describe('refineMethodByMaterial', () => {
  it("SCREEN_PRINT_HARD + 'хлопок' → SCREEN_PRINT_TEXTILE", () => {
    assert.equal(refineMethodByMaterial('SCREEN_PRINT_HARD', 'хлопок'), 'SCREEN_PRINT_TEXTILE');
  });
  it("SCREEN_PRINT_HARD + 'металл' → SCREEN_PRINT_HARD (не трогаем)", () => {
    assert.equal(refineMethodByMaterial('SCREEN_PRINT_HARD', 'металл'), 'SCREEN_PRINT_HARD');
  });
  it("LASER_ENGRAVING + 'хлопок' → LASER_ENGRAVING (нет даунгрейда других методов)", () => {
    assert.equal(refineMethodByMaterial('LASER_ENGRAVING', 'хлопок'), 'LASER_ENGRAVING');
  });
  it("SCREEN_PRINT_HARD + 'Клён' → SCREEN_PRINT_HARD (регрессия: 'лен' внутри 'клён' не должен матчиться)", () => {
    assert.equal(refineMethodByMaterial('SCREEN_PRINT_HARD', 'Клён'), 'SCREEN_PRINT_HARD');
  });
});

describe('parseOasisProduct: уточнение метода по материалу (интеграция)', () => {
  const textileProduct = {
    article: 'TX-001',
    attributes: [{ name: 'Материал товара', value: 'Хлопок 100%' }],
    included_branding: [
      { name: 'Шелкография', size: 'до 100.00 см²', place: 'на груди', setup: 500 },
    ],
  };

  it('материал резолвится до зон: включённое нанесение получает SCREEN_PRINT_TEXTILE, а не SCREEN_PRINT_HARD', () => {
    const r = parseOasisProduct(textileProduct)!;
    assert.equal(r.material, 'Хлопок 100%');
    const z = r.zones.find((x) => x.zoneName === 'на груди')!;
    assert.equal(z.methodCode, 'SCREEN_PRINT_TEXTILE');
  });
});
