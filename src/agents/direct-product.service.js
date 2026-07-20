"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var DirectProductService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DirectProductService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let DirectProductService = DirectProductService_1 = class DirectProductService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(DirectProductService_1.name);
    }
    async search(query, limit = 10) {
        const keywords = [...query.keywords, ...query.mustInclude].filter(Boolean);
        const products = await this.prisma.product.findMany({ orderBy: { name: 'asc' } });
        const scored = products
            .map((p) => ({ product: p, score: this.scoreProduct(p, query, keywords) }))
            .filter((x) => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, Math.min(Math.max(limit, 5), 12));
        if (scored.length === 0 && keywords.length > 0) {
            const fallback = products
                .filter((p) => keywords.some((k) => p.name.toLowerCase().includes(k) || p.category.toLowerCase().includes(k)))
                .slice(0, limit);
            return {
                productIds: fallback.map((p) => p.id),
                products: fallback.map((p) => ({ id: p.id, name: p.name, category: p.category })),
            };
        }
        const picked = scored.length ? scored.map((s) => s.product) : products.slice(0, limit);
        this.logger.log(`Direct product search: ${picked.length} items for [${keywords.join(', ')}]`);
        return {
            productIds: picked.map((p) => p.id),
            products: picked.map((p) => ({ id: p.id, name: p.name, category: p.category })),
        };
    }
    scoreProduct(p, query, keywords) {
        const name = p.name.toLowerCase();
        const category = p.category.toLowerCase();
        const slug = p.slug.toLowerCase();
        let score = 0;
        for (const k of keywords) {
            const kw = k.toLowerCase();
            if (name.includes(kw))
                score += 3;
            if (slug.includes(kw))
                score += 2;
            if (category.includes(kw))
                score += 1;
        }
        for (const hint of query.categoryHints) {
            if (category.includes(hint.toLowerCase()))
                score += 2;
        }
        for (const bad of query.mustNotInclude) {
            if (name.includes(bad.toLowerCase()))
                score -= 5;
        }
        for (const color of query.colors) {
            if (name.includes(color.toLowerCase()))
                score += 1;
        }
        return score;
    }
};
exports.DirectProductService = DirectProductService;
exports.DirectProductService = DirectProductService = DirectProductService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DirectProductService);
//# sourceMappingURL=direct-product.service.js.map