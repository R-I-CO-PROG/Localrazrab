import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const secret = this.config.get<string>('API_SECRET_KEY', '').trim();
    if (!secret) {
      // Fail-closed: пустой/отсутствующий секрет — конфигурационная ошибка, а не «доступ всем».
      this.logger.error('API_SECRET_KEY is not set — denying all non-public requests');
      throw new InternalServerErrorException('Server misconfiguration: API_SECRET_KEY is not set');
    }

    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const headerKey = req.headers['x-api-key']?.trim();
    const auth = req.headers['authorization']?.trim();
    const bearer = auth?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    const provided = headerKey || bearer;

    if (!provided || provided !== secret) {
      throw new UnauthorizedException('Invalid or missing API key');
    }
    return true;
  }
}
