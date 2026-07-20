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
exports.ApiKeyGuard = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const core_1 = require("@nestjs/core");
const public_decorator_1 = require("./public.decorator");
let ApiKeyGuard = class ApiKeyGuard {
    constructor(reflector, config) {
        this.reflector = reflector;
        this.config = config;
    }
    canActivate(context) {
        const isPublic = this.reflector.getAllAndOverride(public_decorator_1.IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic)
            return true;
        const secret = this.config.get('API_SECRET_KEY', '').trim();
        if (!secret)
            return true;
        const req = context.switchToHttp().getRequest();
        const headerKey = req.headers['x-api-key']?.trim();
        const auth = req.headers['authorization']?.trim();
        const bearer = auth?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
        const provided = headerKey || bearer;
        if (!provided || provided !== secret) {
            throw new common_1.UnauthorizedException('Invalid or missing API key');
        }
        return true;
    }
};
exports.ApiKeyGuard = ApiKeyGuard;
exports.ApiKeyGuard = ApiKeyGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        config_1.ConfigService])
], ApiKeyGuard);
//# sourceMappingURL=api-key.guard.js.map