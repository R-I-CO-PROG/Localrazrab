import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { RequestsModule } from './requests/requests.module';
import { AssetsModule } from './assets/assets.module';
import { GenerationModule } from './generation/generation.module';
import { JobsModule } from './jobs/jobs.module';
import { AgentsModule } from './agents/agents.module';
import { CatalogAdminModule } from './catalog/catalog-admin.module';
import { PrecisionModule } from './precision/precision.module';
import { PanelModule } from './panel/panel.module';
import { HealthController } from './health.controller';
import { ApiKeyGuard } from './security/api-key.guard';
import { BffThrottlerGuard } from './security/bff-throttler.guard';
import { SanitizeDebugInterceptor } from './security/sanitize-debug.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'default', ttl: 60_000, limit: 120 },
        { name: 'ai', ttl: 3_600_000, limit: 30 },
      ],
    }),
    PrismaModule,
    ProductsModule,
    RequestsModule,
    AssetsModule,
    GenerationModule,
    JobsModule,
    AgentsModule,
    CatalogAdminModule,
    PrecisionModule,
    // Только для локальной разработки — ручной прогон пайплайна через /panel без фронтенда.
    ...(process.env.NODE_ENV !== 'production' ? [PanelModule] : []),
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: BffThrottlerGuard },
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_INTERCEPTOR, useClass: SanitizeDebugInterceptor },
  ],
})
export class AppModule {}
