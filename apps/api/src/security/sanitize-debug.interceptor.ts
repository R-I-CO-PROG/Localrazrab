import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable, map } from 'rxjs';

function stripDebugFields(value: unknown): unknown {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stripDebugFields);

  const obj = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (key === '_debug' || key === 'debugLog') continue;
    next[key] = stripDebugFields(val);
  }
  return next;
}

/** В production убирает _debug / debugLog из ответов API */
@Injectable()
export class SanitizeDebugInterceptor implements NestInterceptor {
  constructor(private readonly config: ConfigService) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (this.config.get<string>('NODE_ENV') !== 'production') {
      return next.handle();
    }
    return next.handle().pipe(map((data) => stripDebugFields(data)));
  }
}
