import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
export declare class BffThrottlerGuard extends ThrottlerGuard {
    private readonly config;
    constructor(options: ThrottlerModuleOptions, storageService: ThrottlerStorage, reflector: Reflector, config: ConfigService);
    protected shouldSkip(context: ExecutionContext): Promise<boolean>;
}
