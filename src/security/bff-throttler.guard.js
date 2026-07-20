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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BffThrottlerGuard = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const core_1 = require("@nestjs/core");
const throttler_1 = require("@nestjs/throttler");
let BffThrottlerGuard = class BffThrottlerGuard extends throttler_1.ThrottlerGuard {
    constructor(options, storageService, reflector, config) {
        super(options, storageService, reflector);
        this.config = config;
    }
    async shouldSkip(context) {
        if (await super.shouldSkip(context)) {
            return true;
        }
        const secret = this.config.get('API_SECRET_KEY', '').trim();
        if (!secret) {
            return false;
        }
        const req = context.switchToHttp().getRequest();
        const headerKey = String(req.headers['x-api-key'] ?? '').trim();
        const auth = String(req.headers['authorization'] ?? '').trim();
        const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
        const provided = headerKey || bearer;
        return provided === secret;
    }
};
exports.BffThrottlerGuard = BffThrottlerGuard;
exports.BffThrottlerGuard = BffThrottlerGuard = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, throttler_1.InjectThrottlerOptions)()),
    __param(1, (0, throttler_1.InjectThrottlerStorage)()),
    __metadata("design:paramtypes", [Object, Object, core_1.Reflector,
        config_1.ConfigService])
], BffThrottlerGuard);
//# sourceMappingURL=bff-throttler.guard.js.map