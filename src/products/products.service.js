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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let ProductsService = class ProductsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    buildWhere(filters) {
        const where = {};
        if (filters?.category) {
            where.OR = [
                { category: filters.category },
                { subcategory: { contains: filters.category, mode: 'insensitive' } },
            ];
        }
        if (filters?.search?.trim()) {
            where.name = { contains: filters.search.trim(), mode: 'insensitive' };
        }
        return where;
    }
    async findAll(filters) {
        const page = Math.max(1, filters?.page ?? 1);
        const pageSize = Math.min(100, Math.max(1, filters?.pageSize ?? 24));
        const where = this.buildWhere(filters);
        const skip = (page - 1) * pageSize;
        const [items, total] = await Promise.all([
            this.prisma.product.findMany({
                where,
                orderBy: { name: 'asc' },
                skip,
                take: pageSize,
            }),
            this.prisma.product.count({ where }),
        ]);
        return {
            items,
            total,
            page,
            pageSize,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
        };
    }
    findById(id) {
        return this.prisma.product.findUnique({ where: { id } });
    }
    async stats() {
        const [total, categories] = await Promise.all([
            this.prisma.product.count(),
            this.prisma.product.groupBy({
                by: ['category'],
                _count: { _all: true },
                orderBy: { category: 'asc' },
            }),
        ]);
        return {
            total,
            categories: categories.map((c) => ({
                name: c.category,
                count: c._count._all,
            })),
        };
    }
};
exports.ProductsService = ProductsService;
exports.ProductsService = ProductsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ProductsService);
//# sourceMappingURL=products.service.js.map