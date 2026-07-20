"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.colorNameToHex = colorNameToHex;
exports.normalizeRequestColors = normalizeRequestColors;
exports.expandAbstractColorsFromText = expandAbstractColorsFromText;
const brief_color_hex_util_1 = require("./brief-color-hex.util");
const COLOR_NAME_TO_HEX = [
    { keys: ['тёмно-син', 'темно-син', 'темносин', 'dark blue', 'navy'], hex: '#1E3A8A' },
    { keys: ['белый', 'white'], hex: '#FFFFFF' },
    { keys: ['черн', 'black'], hex: '#1A1A1A' },
    { keys: ['серый', 'grey', 'gray', 'серебр', 'silver'], hex: '#9CA3AF' },
    { keys: ['синий', 'blue'], hex: '#3B82F6' },
    { keys: ['голуб'], hex: '#06B6D4' },
    { keys: ['фиолет', 'purple', 'violet'], hex: '#7C5CFC' },
    { keys: ['зелен', 'green', 'эко'], hex: '#22C55E' },
    { keys: ['красн', 'red'], hex: '#EF4444' },
    { keys: ['оранж', 'orange'], hex: '#F97316' },
    { keys: ['желт', 'yellow', 'gold', 'золот'], hex: '#EAB308' },
    { keys: ['розов', 'pink'], hex: '#EC4899' },
    { keys: ['коричн', 'brown'], hex: '#92400E' },
    { keys: ['беж', 'beige', 'крем', 'cream'], hex: '#D4A574' },
    { keys: ['бирюз', 'turquoise', 'teal'], hex: '#14B8A6' },
];
const ABSTRACT_PALETTES = [
    { re: /тепл|warm/i, hex: ['#D4A574', '#EF4444', '#F97316', '#EAB308', '#C65D3B'] },
    { re: /ярк|bright|кислот|expressive|экспрессив|многоцвет/i, hex: ['#EF4444', '#22C55E', '#3B82F6', '#F97316', '#EAB308'] },
    { re: /пастел|pastel/i, hex: ['#EC4899', '#06B6D4', '#D4A574', '#86EFAC', '#FDE68A'] },
    { re: /нейтрал|neutral/i, hex: ['#9CA3AF', '#1A1A1A', '#FFFFFF', '#D4A574'] },
    { re: /технолог|tech|металл|metal|футурист/i, hex: ['#1A1A1A', '#9CA3AF', '#FFFFFF', '#1E3A8A'] },
    { re: /зимн|winter/i, hex: ['#EF4444', '#22C55E', '#EAB308', '#FFFFFF', '#1E3A8A'] },
    { re: /натурал|earth|эко/i, hex: ['#22C55E', '#92400E', '#D4A574', '#6B8E23'] },
];
function colorNameToHex(name) {
    const lower = name.toLowerCase().replace(/ё/g, 'е').trim();
    if (!lower)
        return null;
    const fromHex = (0, brief_color_hex_util_1.normalizeHex)(lower.startsWith('#') ? lower : `#${lower}`);
    if (fromHex)
        return fromHex;
    for (const { keys, hex } of COLOR_NAME_TO_HEX) {
        if (keys.some((k) => lower.includes(k)))
            return hex;
    }
    for (const { re, hex } of ABSTRACT_PALETTES) {
        if (re.test(lower))
            return hex[0];
    }
    return null;
}
function normalizeRequestColors(colors) {
    if (!Array.isArray(colors))
        return [];
    const found = [];
    for (const c of colors) {
        const raw = typeof c === 'string'
            ? c.trim()
            : c && typeof c === 'object' && 'hex' in c
                ? String(c.hex ?? '').trim()
                : c && typeof c === 'object' && 'name' in c
                    ? String(c.name ?? '').trim()
                    : '';
        if (!raw)
            continue;
        const hex = (0, brief_color_hex_util_1.normalizeHex)(raw.startsWith('#') ? raw : `#${raw}`) ?? colorNameToHex(raw);
        if (hex && !found.includes(hex))
            found.push(hex);
        const lower = raw.toLowerCase().replace(/ё/g, 'е');
        for (const { re, hex: palette } of ABSTRACT_PALETTES) {
            if (!re.test(lower))
                continue;
            for (const h of palette) {
                if (!found.includes(h))
                    found.push(h);
            }
        }
    }
    return found.slice(0, 14);
}
function expandAbstractColorsFromText(text) {
    const lower = text.toLowerCase().replace(/ё/g, 'е');
    const found = [];
    for (const { re, hex } of ABSTRACT_PALETTES) {
        if (!re.test(lower))
            continue;
        for (const h of hex) {
            if (!found.includes(h))
                found.push(h);
        }
    }
    return found;
}
//# sourceMappingURL=request-colors.util.js.map