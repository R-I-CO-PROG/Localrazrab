import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCatalogComposeJson, parseCatalogSelectorJson } from './parse-llm-json';
import { parseRerankJson } from '../../agents/catalog-buyer.agent';

/**
 * скан#20: парсеры нейро-подбора (байер/селектор/реранк) делали голый JSON.parse и молча
 * выбрасывали ВЕСЬ набор LLM на тривиальной поломке. Теперь они идут через закалённую лестницу
 * parseAgentJson (repair висячих запятых/одинарных кавычек + salvage обрыва по max_tokens).
 */
describe('скан#20: закалённые JSON-парсеры байера/селектора/реранка', () => {
  describe('parseCatalogComposeJson', () => {
    it('валидный JSON', () => {
      assert.deepEqual(parseCatalogComposeJson('{"productIds":["a","b"]}').productIds, ['a', 'b']);
    });

    it('висячая запятая больше не убивает набор', () => {
      assert.deepEqual(parseCatalogComposeJson('{"productIds":["a","b",]}').productIds, ['a', 'b']);
    });

    it('одинарные кавычки восстанавливаются', () => {
      assert.deepEqual(parseCatalogComposeJson("{'productIds': ['a', 'b']}").productIds, ['a', 'b']);
    });

    it('обрыв по max_tokens спасается (частичный список вместо пустого набора)', () => {
      const truncated = '{"productIds":["a","b","c"';
      assert.deepEqual(parseCatalogComposeJson(truncated).productIds, ['a', 'b', 'c']);
    });

    it('markdown-фенс снимается', () => {
      assert.deepEqual(parseCatalogComposeJson('```json\n{"productIds":["a"]}\n```').productIds, ['a']);
    });
  });

  describe('parseCatalogSelectorJson', () => {
    it('висячая запятая в choices не отбрасывает выбор байера', () => {
      const out = parseCatalogSelectorJson('{"choices":[{"slotIndex":0,"productId":"x"},]}');
      assert.equal(out.choices.length, 1);
      assert.equal(out.choices[0].productId, 'x');
    });

    it('обрыв ответа спасается', () => {
      const out = parseCatalogSelectorJson('{"choices":[{"slotIndex":0,"productId":"x"}');
      assert.equal(out.choices.length, 1);
    });
  });

  describe('parseRerankJson — контракт «никогда не бросает» теперь ПРАВДИВ', () => {
    it('висячая запятая парсится, а не роняет реранк', () => {
      const out = parseRerankJson('{"replace":[{"outId":"a","inId":"b","reason":"r"},]}');
      assert.equal(out.replace.length, 1);
      assert.equal(out.replace[0].inId, 'b');
    });

    it('полный мусор → пустой результат, а НЕ исключение', () => {
      assert.doesNotThrow(() => parseRerankJson('это вообще не json'));
      assert.deepEqual(parseRerankJson('это вообще не json').replace, []);
    });
  });
});
