import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { renderTextToPng, escapeXml, sanitizeColorHex } from './art-renderer';

describe('escapeXml', () => {
  it('экранирует амперсанд и угловые скобки', () => {
    assert.equal(escapeXml('A & B <c>'), 'A &amp; B &lt;c&gt;');
  });
  it('экранирует кавычки', () => {
    assert.equal(escapeXml('"ACME"'), '&quot;ACME&quot;');
  });
});

describe('renderTextToPng', () => {
  it('возвращает PNG с альфой', async () => {
    const buf = await renderTextToPng('ACME', { colorHex: '#000000' });
    const meta = await sharp(buf).metadata();
    assert.equal(meta.format, 'png');
    assert.equal(meta.channels, 4);
    assert.ok((meta.width ?? 0) > 0);
  });

  it('кириллица не роняет рендер', async () => {
    const buf = await renderTextToPng('Мерчай', { colorHex: '#ff0000' });
    assert.ok((await sharp(buf).metadata()).width! > 0);
  });

  it('текст с XML-спецсимволами не ломает SVG', async () => {
    const buf = await renderTextToPng('R&D <2026>', { colorHex: '#000000' });
    assert.ok((await sharp(buf).metadata()).width! > 0);
  });

  it('пустой текст отвергается', async () => {
    await assert.rejects(() => renderTextToPng('   ', { colorHex: '#000' }), /пуст/i);
  });

  it('вредоносный colorHex (SVG-инъекция) не ломает рендер и не пробрасывается в атрибут', async () => {
    const malicious = '#000"/><image href="http://x"/><text fill="';
    const buf = await renderTextToPng('ACME', { colorHex: malicious });
    const meta = await sharp(buf).metadata();
    assert.equal(meta.format, 'png');
    assert.ok((meta.width ?? 0) > 0);
  });

  it('валидный HEX-цвет #ff0000 проходит без изменений', async () => {
    const buf = await renderTextToPng('ACME', { colorHex: '#ff0000' });
    assert.ok((await sharp(buf).metadata()).width! > 0);
  });

  it('валидный короткий HEX-цвет #abc проходит без изменений', async () => {
    const buf = await renderTextToPng('ACME', { colorHex: '#abc' });
    assert.ok((await sharp(buf).metadata()).width! > 0);
  });

  it('валидное имя CSS-цвета black проходит без изменений', async () => {
    const buf = await renderTextToPng('ACME', { colorHex: 'black' });
    assert.ok((await sharp(buf).metadata()).width! > 0);
  });
});

describe('sanitizeColorHex', () => {
  it('отклоняет попытку SVG-инъекции и возвращает дефолтный чёрный', () => {
    assert.equal(sanitizeColorHex('#000"/><image href="http://x"/><text fill="'), '#000000');
  });
  it('отклоняет произвольную строку', () => {
    assert.equal(sanitizeColorHex('javascript:alert(1)'), '#000000');
  });
  it('пропускает валидный HEX (3/6/8 символов) и короткое имя цвета', () => {
    assert.equal(sanitizeColorHex('#ff0000'), '#ff0000');
    assert.equal(sanitizeColorHex('#abc'), '#abc');
    assert.equal(sanitizeColorHex('#ff0000aa'), '#ff0000aa');
    assert.equal(sanitizeColorHex('black'), 'black');
  });
  it('пустое/отсутствующее значение — дефолтный чёрный', () => {
    assert.equal(sanitizeColorHex(undefined), '#000000');
    assert.equal(sanitizeColorHex(''), '#000000');
  });
});
