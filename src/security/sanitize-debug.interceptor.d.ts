import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
export declare class SanitizeDebugInterceptor implements NestInterceptor {
    private readonly config;
    constructor(config: ConfigService);
    intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown>;
}
