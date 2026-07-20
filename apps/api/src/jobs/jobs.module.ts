import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { GenerationModule } from '../generation/generation.module';

@Module({
  imports: [GenerationModule],
  controllers: [JobsController],
})
export class JobsModule {}
