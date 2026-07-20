/** Позиции логотипов на студийном flat-lay (доли 0–1 от размера кадра) */
export interface LogoPlacement {
  centerX: number;
  centerY: number;
  /** Доля ширины кадра */
  scale: number;
}

export interface ProductCell {
  x: number;
  y: number;
  size: number;
  labelY: number;
}

/** Сцена «на столе» для AI-референса (без карточек-сетки) */
export function computeSceneTablePositions(count: number, width: number, height: number): ProductCell[] {
  if (count === 1) {
    const size = Math.round(Math.min(width, height) * 0.52);
    const x = Math.round((width - size) / 2);
    const y = Math.round(height * 0.32);
    return [{ x, y, size, labelY: y + size + 16 }];
  }
  if (count === 2) {
    const size = Math.round(width * 0.36);
    const y = Math.round(height * 0.36);
    return [
      { x: Math.round(width * 0.1), y, size, labelY: y + size + 16 },
      { x: Math.round(width * 0.54), y, size, labelY: y + size + 16 },
    ];
  }
  if (count === 3) {
    const size = Math.round(width * 0.28);
    const y = Math.round(height * 0.38);
    return [
      { x: Math.round(width * 0.08), y, size, labelY: y + size + 16 },
      { x: Math.round(width * 0.36), y: Math.round(y - size * 0.08), size, labelY: y + size + 16 },
      { x: Math.round(width * 0.64), y, size, labelY: y + size + 16 },
    ];
  }
  return computeProductGrid(count, width, height);
}

/** Сетка для быстрого мокапа */
export function computeProductGrid(count: number, width: number, height: number): ProductCell[] {
  const padding = 56;
  const footerH = 36;
  const cols = count <= 1 ? 1 : count <= 2 ? 2 : count <= 4 ? 2 : count <= 6 ? 3 : count <= 9 ? 3 : 4;
  const rows = Math.ceil(count / cols);
  const availW = width - padding * 2;
  const availH = height - padding * 2 - footerH;
  const cellW = Math.floor(availW / cols);
  const cellH = Math.floor(availH / rows);
  const labelH = 22;
  const productSize = Math.max(72, Math.min(cellW - 16, cellH - labelH - 20));

  const positions: ProductCell[] = [];
  const gridW = cols * cellW;
  const gridH = rows * cellH;
  const startX = Math.floor((width - gridW) / 2);
  const startY = Math.floor((height - footerH - gridH) / 2) + 8;

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = startX + col * cellW + Math.floor(cellW / 2);
    const cy = startY + row * cellH + Math.floor((cellH - labelH) / 2);
    positions.push({
      x: cx - Math.floor(productSize / 2),
      y: cy - Math.floor(productSize / 2),
      size: productSize,
      labelY: cy + Math.floor(productSize / 2) + 8,
    });
  }

  return positions;
}

/**
 * Позиции логотипов под студийный flat-lay как на референсе (NEXORA-style).
 * AI рисует товары без брендинга — логотип кладём программно.
 */
function isClothingName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes('футбол') ||
    n.includes('поло') ||
    n.includes('худи') ||
    n.includes('свитшот') ||
    n.includes('кепк') ||
    n.includes('бини') ||
    n.includes('шарф') ||
    n.includes('носок')
  );
}

/** Позиции логотипов под студийную сцену с одеждой (3D flat-lay) */
function getClothingStudioPlacements(count: number, names: string[]): LogoPlacement[] {
  const lower = names.map((n) => n.toLowerCase());
  const hasCap = lower.some((n) => n.includes('кепк') || n.includes('бини'));
  const hasSocks = lower.some((n) => n.includes('носок'));
  const apparel = lower.filter(
    (n) =>
      n.includes('футбол') ||
      n.includes('поло') ||
      n.includes('худи') ||
      n.includes('свитшот'),
  );

  if (count === 3 && hasSocks && hasCap) {
    return [
      { centerX: 0.2, centerY: 0.58, scale: 0.075 },
      { centerX: 0.48, centerY: 0.52, scale: 0.1 },
      { centerX: 0.5, centerY: 0.2, scale: 0.095 },
    ];
  }
  if (count === 3 && hasCap && apparel.length >= 2) {
    return [
      { centerX: 0.38, centerY: 0.52, scale: 0.1 },
      { centerX: 0.72, centerY: 0.38, scale: 0.09 },
      { centerX: 0.5, centerY: 0.2, scale: 0.095 },
    ];
  }
  if (count === 3 && hasCap) {
    return [
      { centerX: 0.36, centerY: 0.52, scale: 0.1 },
      { centerX: 0.64, centerY: 0.48, scale: 0.095 },
      { centerX: 0.5, centerY: 0.2, scale: 0.095 },
    ];
  }

  return getStudioLogoPlacements(count);
}

/** Логотипы после AI-рендера: студийные пресеты или сетка мокапа */
export function getLogoPlacementsForScene(
  count: number,
  productNames: string[] = [],
  width = 1024,
  height = 1024,
): LogoPlacement[] {
  if (count <= 0) return [];
  const allClothing =
    productNames.length === count && productNames.every((n) => isClothingName(n));
  if (allClothing) {
    return getClothingStudioPlacements(count, productNames);
  }
  const grid = logoPlacementsFromGrid(count, width, height);
  if (grid.length === count) return grid;
  return getStudioLogoPlacements(count);
}

/** Позиции логотипов по ячейкам мокап-сетки (flat lay) */
export function logoPlacementsFromGrid(count: number, width: number, height: number): LogoPlacement[] {
  const cells = computeProductGrid(count, width, height);
  return cells.map((cell) => ({
    centerX: (cell.x + cell.size * 0.38) / width,
    centerY: (cell.y + cell.size * 0.36) / height,
    scale: Math.min(0.14, (cell.size * 0.32) / width),
  }));
}

export function getStudioLogoPlacements(count: number): LogoPlacement[] {
  const presets: Record<number, LogoPlacement[]> = {
    1: [{ centerX: 0.5, centerY: 0.5, scale: 0.14 }],
    2: [
      { centerX: 0.34, centerY: 0.48, scale: 0.13 },
      { centerX: 0.66, centerY: 0.48, scale: 0.13 },
    ],
    3: [
      { centerX: 0.28, centerY: 0.42, scale: 0.11 },
      { centerX: 0.52, centerY: 0.55, scale: 0.1 },
      { centerX: 0.76, centerY: 0.44, scale: 0.11 },
    ],
    4: [
      { centerX: 0.22, centerY: 0.4, scale: 0.09 },
      { centerX: 0.48, centerY: 0.52, scale: 0.1 },
      { centerX: 0.38, centerY: 0.68, scale: 0.055 },
      { centerX: 0.74, centerY: 0.46, scale: 0.1 },
    ],
  };

  if (presets[count]) return presets[count];

  const cols = count <= 6 ? 3 : 4;
  const placements: LogoPlacement[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const rows = Math.ceil(count / cols);
    placements.push({
      centerX: (col + 0.5) / cols,
      centerY: 0.28 + (row + 0.5) * (0.5 / rows),
      scale: count > 6 ? 0.07 : 0.085,
    });
  }
  return placements;
}
