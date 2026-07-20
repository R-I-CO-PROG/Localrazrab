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
var ReplicateImageProvider_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReplicateImageProvider = void 0;
const common_1 = require("@nestjs/common");
const stub_image_provider_1 = require("./stub-image.provider");
let ReplicateImageProvider = ReplicateImageProvider_1 = class ReplicateImageProvider {
    constructor(stub) {
        this.stub = stub;
        this.logger = new common_1.Logger(ReplicateImageProvider_1.name);
    }
    async generate(input) {
        this.logger.warn('ReplicateImageProvider not implemented, using stub');
        return this.stub.generate(input);
    }
};
exports.ReplicateImageProvider = ReplicateImageProvider;
exports.ReplicateImageProvider = ReplicateImageProvider = ReplicateImageProvider_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [stub_image_provider_1.StubImageProvider])
], ReplicateImageProvider);
//# sourceMappingURL=replicate-image.provider.js.map