import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { PrecisionController } from './precision.controller';
import { PrecisionService } from './precision.service';
import { PrecisionProcessor } from './precision.processor';
import { PhotoSearchService } from './photo-search.service';
import { PrecisionJudgeService } from '../generation/precision-judge.service';
import { OpenrouterImageProvider } from '../providers/image/openrouter-image.provider';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [PrecisionController],
  providers: [PrecisionService, PrecisionProcessor, PhotoSearchService, PrecisionJudgeService, OpenrouterImageProvider],
})
export class PrecisionModule {}
