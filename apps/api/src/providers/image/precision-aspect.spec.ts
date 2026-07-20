import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aspectRatioFromSize } from './precision-aspect';

describe('aspectRatioFromSize', () => {
  it('квадрат', () => assert.equal(aspectRatioFromSize(1000, 1000), '1:1'));
  it('обычное фото 4:3', () => assert.equal(aspectRatioFromSize(1600, 1200), '4:3'));
  it('портрет 3:4', () => assert.equal(aspectRatioFromSize(1200, 1600), '3:4'));
  it('широкое 16:9', () => assert.equal(aspectRatioFromSize(1920, 1080), '16:9'));
  it('почти квадрат тянет в 1:1', () => assert.equal(aspectRatioFromSize(1010, 1000), '1:1'));
  it('нестандартное 5:4 округляется к ближайшему 4:3', () => assert.equal(aspectRatioFromSize(1250, 1000), '4:3'));
  it('нулевая высота не роняет', () => assert.equal(aspectRatioFromSize(100, 0), '1:1'));
});
