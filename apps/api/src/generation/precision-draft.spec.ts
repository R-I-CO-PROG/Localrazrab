import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { placementToPixels, buildDraftComposite } from './precision-draft';

const place = (cx: number, cy: number, w: number, h: number, rotation = 0) => ({ cx, cy, w, h, rotation });

describe('placementToPixels', () => {
  it('центр кадра', () => {
    assert.deepEqual(placementToPixels(place(0.5, 0.5, 0.2, 0.1), 1000, 800), {
      left: 400,
      top: 360,
      width: 200,
      height: 80,
      rotation: 0,
    });
  });

  it('левый верхний угол', () => {
    const r = placementToPixels(place(0.1, 0.1, 0.2, 0.2), 1000, 1000);
    assert.equal(r.left, 0);
    assert.equal(r.top, 0);
  });

  it('поворот пробрасывается как есть', () => {
    assert.equal(placementToPixels(place(0.5, 0.5, 0.2, 0.2, -15), 100, 100).rotation, -15);
  });

  it('выход за правый край — сдвигаем внутрь кадра, размер сохраняем', () => {
    const r = placementToPixels(place(0.95, 0.5, 0.2, 0.2), 1000, 1000);
    assert.equal(r.width, 200);
    assert.equal(r.left, 800);
  });

  it('нанесение шире кадра — обрезаем ширину до кадра', () => {
    const r = placementToPixels(place(0.5, 0.5, 1.5, 0.2), 1000, 1000);
    assert.equal(r.left, 0);
    assert.equal(r.width, 1000);
  });

  it('нулевой размер не даёт нулевую ширину', () => {
    assert.ok(placementToPixels(place(0.5, 0.5, 0, 0), 1000, 1000).width >= 1);
  });
});

describe('buildDraftComposite', () => {
  it('возвращает PNG исходного размера с наложенным артом', async () => {
    const source = await sharp({
      create: { width: 600, height: 400, channels: 3, background: { r: 200, g: 200, b: 200 } },
    })
      .png()
      .toBuffer();

    const art = await sharp({
      create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer();

    const out = await buildDraftComposite(source, [
      { artPng: art, placement: place(0.5, 0.5, 0.2, 0.2), surface: 'flat' },
    ]);

    const meta = await sharp(out).metadata();
    assert.equal(meta.width, 600);
    assert.equal(meta.height, 400);

    // центр стал заметно краснее исходного серого
    const { data } = await sharp(out).extract({ left: 295, top: 195, width: 10, height: 10 }).raw().toBuffer({ resolveWithObject: true });
    assert.ok(data[0] > data[2] + 20, 'центр должен покраснеть');
  });

  it('без слоёв возвращает исходник неизменным по размеру', async () => {
    const source = await sharp({
      create: { width: 320, height: 240, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .png()
      .toBuffer();
    const meta = await sharp(await buildDraftComposite(source, [])).metadata();
    assert.equal(meta.width, 320);
    assert.equal(meta.height, 240);
  });

  it('большое нанесение с поворотом 45° не падает и сохраняет размер кадра', async () => {
    const source = await sharp({
      create: { width: 1000, height: 1000, channels: 3, background: { r: 200, g: 200, b: 200 } },
    })
      .png()
      .toBuffer();

    const art = await sharp({
      create: { width: 200, height: 200, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer();

    const out = await buildDraftComposite(source, [
      { artPng: art, placement: place(0.5, 0.5, 0.75, 0.75, 45), surface: 'flat' },
    ]);

    const meta = await sharp(out).metadata();
    assert.equal(meta.width, 1000);
    assert.equal(meta.height, 1000);
  });

  it('повёрнутое нанесение в углу кадра не падает и сохраняет размер кадра', async () => {
    const source = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 200, b: 200 } },
    })
      .png()
      .toBuffer();

    const art = await sharp({
      create: { width: 200, height: 200, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer();

    const out = await buildDraftComposite(source, [
      { artPng: art, placement: place(0.95, 0.9, 0.5, 0.5, 30), surface: 'flat' },
    ]);

    const meta = await sharp(out).metadata();
    assert.equal(meta.width, 800);
    assert.equal(meta.height, 600);
  });

  it('небольшое нанесение с поворотом по-прежнему не падает', async () => {
    const source = await sharp({
      create: { width: 600, height: 400, channels: 3, background: { r: 200, g: 200, b: 200 } },
    })
      .png()
      .toBuffer();

    const art = await sharp({
      create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer();

    const out = await buildDraftComposite(source, [
      { artPng: art, placement: place(0.5, 0.5, 0.2, 0.2, 20), surface: 'flat' },
    ]);

    const meta = await sharp(out).metadata();
    assert.equal(meta.width, 600);
    assert.equal(meta.height, 400);
  });
});
