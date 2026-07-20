import dns from 'dns';

import { NestFactory } from '@nestjs/core';

import { ValidationPipe } from '@nestjs/common';

import { NestExpressApplication } from '@nestjs/platform-express';

import { json, urlencoded } from 'express';

import helmet from 'helmet';

import { join } from 'path';

import { existsSync, mkdirSync } from 'fs';

import { AppModule } from './app.module';

import { isProductionEnv, requireProductionSecret } from './security/env.util';



dns.setDefaultResultOrder('ipv4first');



function ensureUploadDirs(base: string) {

  for (const sub of ['assets', 'generated', 'silhouettes', 'products', 'temp']) {

    const dir = join(base, sub);

    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  }

}



async function bootstrap() {

  if (isProductionEnv()) {

    requireProductionSecret('API_SECRET_KEY', process.env.API_SECRET_KEY);

    requireProductionSecret('DATABASE_URL', process.env.DATABASE_URL);

    if (!process.env.CORS_ORIGIN?.trim()) {

      console.warn('⚠️  CORS_ORIGIN is empty in production — only same-origin BFF proxy is recommended');

    }

  }



  const app = await NestFactory.create<NestExpressApplication>(AppModule);



  app.use(

    helmet({

      contentSecurityPolicy: {

        directives: {

          defaultSrc: ["'none'"],

          scriptSrc: ["'none'"],

          objectSrc: ["'none'"],

          styleSrc: ["'self'"],

          imgSrc: ["'self'", 'data:'],

          frameAncestors: ["'none'"],

          baseUri: ["'none'"],

          formAction: ["'none'"],

        },

      },

      crossOriginResourcePolicy: { policy: 'cross-origin' },

    }),

  );

  app.use(json({ limit: '1mb' }));

  app.use(urlencoded({ extended: true, limit: '1mb' }));



  const corsOrigin = process.env.CORS_ORIGIN?.trim();

  app.enableCors({

    origin: isProductionEnv()

      ? corsOrigin

        ? corsOrigin.split(',').map((o) => o.trim())

        : false

      : corsOrigin

        ? corsOrigin.split(',').map((o) => o.trim())

        : true,

    credentials: false,

  });



  app.useGlobalPipes(

    new ValidationPipe({

      whitelist: true,

      transform: true,

      transformOptions: { enableImplicitConversion: true },

    }),

  );



  const uploadsDir = process.env.UPLOADS_DIR || join(process.cwd(), '../../uploads');

  ensureUploadDirs(uploadsDir);

  app.useStaticAssets(uploadsDir, { prefix: '/uploads' });



  const catalogDir =

    process.env.CATALOG_HANDOFF_DIR || join(process.cwd(), '../../data/catalog-handoff-full');

  if (existsSync(catalogDir)) {

    app.useStaticAssets(catalogDir, { prefix: '/catalog-handoff' });

    console.log(`Catalog handoff: ${catalogDir} → /catalog-handoff/`);

  }



  const llm = process.env.LLM_PROVIDER ?? 'stub';

  const image = process.env.IMAGE_PROVIDER ?? 'local';

  console.log(`Providers: LLM=${llm}, IMAGE=${image}`);

  console.log(`Uploads dir: ${uploadsDir}`);

  console.log(`Environment: ${process.env.NODE_ENV ?? 'development'}`);



  const port = Number(process.env.API_PORT) || 3001;

  const host = process.env.API_HOST || '0.0.0.0';

  await app.listen(port, host);

  const publicUrl = process.env.PUBLIC_API_URL?.replace(/\/$/, '');

  console.log(`API running on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);

  if (publicUrl) console.log(`Public uploads: ${publicUrl}/uploads/`);

}



bootstrap();

