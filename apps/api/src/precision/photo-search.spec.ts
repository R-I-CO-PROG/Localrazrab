import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePhotoDescription, parseRerankResponse, stemRu, photoSearchTerms } from './photo-search.parsers';

describe('parsePhotoDescription', () => {
  it('разбирает валидный JSON', () => {
    const d = parsePhotoDescription('{"productType":"термокружка","category":"Кружки","material":"металл","dominantColor":"чёрный","keywords":["термокружка","стальная"]}');
    assert.equal(d!.productType, 'термокружка');
    assert.deepEqual(d!.keywords, ['термокружка', 'стальная']);
  });

  it('JSON в markdown-обёртке', () => {
    assert.equal(parsePhotoDescription('```json\n{"productType":"ручка","keywords":[]}\n```')!.productType, 'ручка');
  });

  it('мусор → null', () => {
    assert.equal(parsePhotoDescription('не могу распознать'), null);
  });

  it('отсутствующие поля не роняют', () => {
    const d = parsePhotoDescription('{"productType":"зонт"}');
    assert.deepEqual(d, { productType: 'зонт', category: null, material: null, dominantColor: null, keywords: [] });
  });
});

describe('stemRu / photoSearchTerms', () => {
  it('множественное/падеж стеммятся к общему корню единственного', () => {
    // «кружки» и «кружка» должны дать один и тот же стем, который ловит оба подстрокой
    const stem = stemRu('кружки');
    assert.ok('кружка'.includes(stem), `«кружка» должно содержать стем «${stem}»`);
    assert.ok('кружку'.includes(stem));
    assert.equal(stemRu('чашка'), 'чашк');
  });

  it('короткие слова не режем', () => {
    assert.equal(stemRu('шар'), 'шар');
    assert.equal(stemRu('нож'), 'нож');
  });

  it('термины уникальны, стем ≥3, из типа + ключевых слов', () => {
    const terms = photoSearchTerms({
      productType: 'кружки',
      category: 'Посуда',
      material: null,
      dominantColor: null,
      keywords: ['кружка', 'термокружки', 'ых'],
    });
    // «кружки»→«кружк», «кружка»→«кружк» дедупятся; «ых» (<3 после стема) отбрасывается
    assert.ok(terms.includes('кружк'));
    assert.equal(terms.filter((t) => t === 'кружк').length, 1);
    assert.ok(!terms.some((t) => t.length < 3));
  });
});

describe('parseRerankResponse', () => {
  const allowed = ['p1', 'p2', 'p3'];

  it('сортирует по убыванию сходства', () => {
    const r = parseRerankResponse('{"matches":[{"productId":"p2","similarity":70,"reason":"похож"},{"productId":"p1","similarity":95,"reason":"точно он"}]}', allowed);
    assert.deepEqual(r.map((m) => m.productId), ['p1', 'p2']);
  });

  it('выкидывает id вне списка кандидатов', () => {
    const r = parseRerankResponse('{"matches":[{"productId":"НЕСУЩЕСТВУЮЩИЙ","similarity":99,"reason":""}]}', allowed);
    assert.deepEqual(r, []);
  });

  it('зажимает similarity в 0..100', () => {
    const r = parseRerankResponse('{"matches":[{"productId":"p1","similarity":250,"reason":""},{"productId":"p2","similarity":-5,"reason":""}]}', allowed);
    assert.equal(r[0].similarity, 100);
    assert.equal(r[1].similarity, 0);
  });

  it('мусор → пустой список, не исключение', () => {
    assert.deepEqual(parseRerankResponse('извините', allowed), []);
  });

  it('matches — строка вместо массива → пустой список, не исключение', () => {
    assert.deepEqual(
      parseRerankResponse('{"matches":"no similar products found"}', ['p1', 'p2']),
      [],
    );
  });

  it('matches — объект вместо массива → пустой список, не исключение', () => {
    assert.deepEqual(parseRerankResponse('{"matches":{"foo":1}}', ['p1']), []);
  });

  it('matches — число вместо массива → пустой список, не исключение', () => {
    assert.deepEqual(parseRerankResponse('{"matches":5}', ['p1']), []);
  });
});
