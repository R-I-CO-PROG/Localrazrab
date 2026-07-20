"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InjectQueue = void 0;
const common_1 = require("@nestjs/common");
const InjectQueue = (name) => (0, common_1.Inject)(`BULLMQ_QUEUE_${name}`);
exports.InjectQueue = InjectQueue;
//# sourceMappingURL=generation-queue.decorator.js.map