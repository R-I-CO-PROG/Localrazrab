"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalCompositeImageProvider = void 0;
const common_1 = require("@nestjs/common");
const path_1 = require("path");
const sharp_1 = __importDefault(require("sharp"));
function getUploadsDir() {
    return process.env.UPLOADS_DIR || (0, path_1.join)(process.cwd(), '../../uploads');
}
let LocalCompositeImageProvider = class LocalCompositeImageProvider {
    async generate(input) {
        const uploadsDir = getUploadsDir();
        const silhouetteUrls = input.silhouetteUrls ?? [];
        const productNames = input.productNames ?? [];
        const category = input.category ?? 'Набор';
        const quantity = input.quantity ?? null;
        const width = input.width ?? 1024;
        const height = input.height ?? 1024;
        const headerHeight = 140;
        const padding = 48;
        const itemCount = Math.max(silhouetteUrls.length, 1);
        const cols = Math.min(4, itemCount);
        const rows = Math.ceil(itemCount / cols);
        const cellW = Math.floor((width - padding * 2) / cols);
        const cellH = Math.floor((height - headerHeight - padding * 2) / rows);
        const composites = [];
        for (let i = 0; i < silhouetteUrls.length; i++) {
            const relPath = silhouetteUrls[i].replace(/^\/uploads/, '');
            const filePath = (0, path_1.join)(uploadsDir, relPath);
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = padding + col * cellW + Math.floor(cellW * 0.15);
            const y = headerHeight + padding + row * cellH + Math.floor(cellH * 0.1);
            const size = Math.min(cellW, cellH) - 20;
            try {
                const resized = await (0, sharp_1.default)(filePath)
                    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                    .png()
                    .toBuffer();
                composites.push({ input: resized, left: x, top: y });
            }
            catch {
            }
        }
        const title = this.escapeXml(`${category} · ${quantity ?? '?'} шт.`);
        const subtitle = this.escapeXml(productNames.slice(0, 8).join(' · ') || input.prompt.slice(0, 120));
        const badge = input.hasLogo ? 'С логотипом (превью)' : 'Концепт набора';
        const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f8f9fc"/>
            <stop offset="100%" stop-color="#ede9fe"/>
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#bg)"/>
        <rect x="0" y="0" width="${width}" height="${headerHeight}" fill="#7C5CFC"/>
        <text x="${padding}" y="52" font-family="Arial,sans-serif" font-size="32" font-weight="bold" fill="white">${title}</text>
        <text x="${padding}" y="88" font-family="Arial,sans-serif" font-size="16" fill="#e8e0ff">${subtitle}</text>
        <text x="${padding}" y="118" font-family="Arial,sans-serif" font-size="13" fill="#d4c9ff">${this.escapeXml(badge)} · local preview</text>
        <rect x="${padding}" y="${headerHeight + 12}" width="${width - padding * 2}" height="${height - headerHeight - 24}" rx="16" fill="white" fill-opacity="0.85"/>
      </svg>
    `;
        const base = await (0, sharp_1.default)(Buffer.from(svg)).png().toBuffer();
        await (0, sharp_1.default)(base).composite(composites).png().toFile(input.outputPath);
        return input.outputPath;
    }
    escapeXml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
};
exports.LocalCompositeImageProvider = LocalCompositeImageProvider;
exports.LocalCompositeImageProvider = LocalCompositeImageProvider = __decorate([
    (0, common_1.Injectable)()
], LocalCompositeImageProvider);
//# sourceMappingURL=local-composite-image.provider.js.map