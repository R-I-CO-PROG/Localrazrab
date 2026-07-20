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
exports.StubImageProvider = void 0;
const common_1 = require("@nestjs/common");
const sharp_1 = __importDefault(require("sharp"));
let StubImageProvider = class StubImageProvider {
    async generate(input) {
        const width = input.width ?? 800;
        const height = input.height ?? 600;
        const lines = [
            'Концепция сувенирного набора',
            '',
            input.prompt.slice(0, 200),
        ];
        const svgText = lines
            .map((line, i) => {
            const y = 80 + i * 36;
            const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<text x="40" y="${y}" font-family="Arial,sans-serif" font-size="22" fill="#1a1a1a">${escaped}</text>`;
        })
            .join('\n');
        const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f5f5f5"/>
        <rect x="20" y="20" width="${width - 40}" height="${height - 40}" rx="12" fill="#ffffff" stroke="#7C5CFC" stroke-width="3"/>
        ${svgText}
        <text x="40" y="${height - 40}" font-family="Arial,sans-serif" font-size="14" fill="#888">Сгенерировано MVP · Убийца Сувенирки</text>
      </svg>
    `;
        await (0, sharp_1.default)(Buffer.from(svg)).png().toFile(input.outputPath);
        return input.outputPath;
    }
};
exports.StubImageProvider = StubImageProvider;
exports.StubImageProvider = StubImageProvider = __decorate([
    (0, common_1.Injectable)()
], StubImageProvider);
//# sourceMappingURL=stub-image.provider.js.map