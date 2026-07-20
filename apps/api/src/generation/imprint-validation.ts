import { getImprintMethod, type ImprintMethodCode } from './imprint-methods';

/** Нормализованные координаты 0..1 относительно фото; rotation в градусах */
export interface Placement {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation: number;
}

export interface ImprintZoneLimits {
  zoneName: string | null;
  maxWidthMm: number | null;
  maxHeightMm: number | null;
  maxAreaMm2: number | null;
  maxColors: number | null;
}

export interface ImprintToValidate {
  methodCode: ImprintMethodCode;
  colorCount: number;
  sizeMm?: { w: number; h: number };
  placement: Placement;
  zone?: ImprintZoneLimits;
}

export interface ImprintWarning {
  level: 'warn';
  code:
    | 'SIZE_OVER_METHOD'
    | 'SIZE_OVER_ZONE'
    | 'AREA_OVER_ZONE'
    | 'COLORS_OVER_METHOD'
    | 'COLORS_OVER_ZONE'
    | 'MATERIAL_MISMATCH'
    | 'ZONES_OVERLAP';
  messageRu: string;
  /** Индекс блока нанесения; для ZONES_OVERLAP — индекс первого из пары */
  imprintIndex: number;
}

function warn(code: ImprintWarning['code'], messageRu: string, imprintIndex: number): ImprintWarning {
  return { level: 'warn', code, messageRu, imprintIndex };
}

/** Прямоугольники в нормализованных координатах пересекаются? Поворот игнорируем — берём AABB. */
function overlaps(a: Placement, b: Placement): boolean {
  const ax1 = a.cx - a.w / 2;
  const ax2 = a.cx + a.w / 2;
  const ay1 = a.cy - a.h / 2;
  const ay2 = a.cy + a.h / 2;
  const bx1 = b.cx - b.w / 2;
  const bx2 = b.cx + b.w / 2;
  const by1 = b.cy - b.h / 2;
  const by2 = b.cy + b.h / 2;
  return ax1 < bx2 && bx1 < ax2 && ay1 < by2 && by1 < ay2;
}

export function validateImprints(
  imprints: ImprintToValidate[],
  ctx: { materialRu?: string | null },
): ImprintWarning[] {
  const out: ImprintWarning[] = [];
  const material = ctx.materialRu?.trim().toLowerCase() ?? '';

  imprints.forEach((imp, i) => {
    const method = getImprintMethod(imp.methodCode);

    if (imp.sizeMm) {
      const overW = method.maxWidthMm != null && imp.sizeMm.w > method.maxWidthMm;
      const overH = method.maxHeightMm != null && imp.sizeMm.h > method.maxHeightMm;
      if (overW || overH) {
        out.push(
          warn(
            'SIZE_OVER_METHOD',
            `${method.labelRu}: максимум ${method.maxWidthMm}×${method.maxHeightMm} мм, задано ${imp.sizeMm.w}×${imp.sizeMm.h} мм`,
            i,
          ),
        );
      }
    }

    if (method.maxColors != null && imp.colorCount > method.maxColors) {
      out.push(
        warn(
          'COLORS_OVER_METHOD',
          `${method.labelRu}: максимум ${method.maxColors} ${method.maxColors === 1 ? 'цвет' : 'цвета'}, задано ${imp.colorCount}`,
          i,
        ),
      );
    }

    if (material && method.materialsRu.length > 0 && !method.materialsRu.some((m) => material.includes(m))) {
      out.push(
        warn(
          'MATERIAL_MISMATCH',
          `${method.labelRu} обычно не применяется к материалу «${ctx.materialRu}»`,
          i,
        ),
      );
    }

    const zone = imp.zone;
    if (zone) {
      if (imp.sizeMm) {
        const overW = zone.maxWidthMm != null && imp.sizeMm.w > zone.maxWidthMm;
        const overH = zone.maxHeightMm != null && imp.sizeMm.h > zone.maxHeightMm;
        if (overW || overH) {
          out.push(
            warn(
              'SIZE_OVER_ZONE',
              `Зона «${zone.zoneName ?? 'без названия'}»: максимум ${zone.maxWidthMm}×${zone.maxHeightMm} мм`,
              i,
            ),
          );
        } else if (zone.maxAreaMm2 != null && imp.sizeMm.w * imp.sizeMm.h > zone.maxAreaMm2) {
          out.push(
            warn(
              'AREA_OVER_ZONE',
              `Зона «${zone.zoneName ?? 'без названия'}»: максимум ${zone.maxAreaMm2} мм², задано ${imp.sizeMm.w * imp.sizeMm.h} мм²`,
              i,
            ),
          );
        }
      }
      if (zone.maxColors != null && imp.colorCount > zone.maxColors) {
        out.push(
          warn('COLORS_OVER_ZONE', `Зона «${zone.zoneName ?? 'без названия'}»: максимум ${zone.maxColors} цв.`, i),
        );
      }
    }
  });

  for (let i = 0; i < imprints.length; i++) {
    for (let j = i + 1; j < imprints.length; j++) {
      if (overlaps(imprints[i].placement, imprints[j].placement)) {
        out.push(warn('ZONES_OVERLAP', `Нанесения ${i + 1} и ${j + 1} перекрываются`, i));
      }
    }
  }

  return out;
}
