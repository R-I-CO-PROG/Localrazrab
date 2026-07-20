import { Module, forwardRef } from '@nestjs/common';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { RequestsModule } from '../requests/requests.module';

@Module({
  imports: [forwardRef(() => RequestsModule)],
  controllers: [AssetsController],
  providers: [AssetsService],
})
export class AssetsModule {}
