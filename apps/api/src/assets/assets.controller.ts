import {
  Controller,
  Post,
  Param,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Headers,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { AssetsService } from './assets.service';
import { AssetType } from '@prisma/client';
import { assetMulterOptions } from './upload.config';

@Controller('requests/:requestId/assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('logo')
  @UseInterceptors(FileInterceptor('file', assetMulterOptions()))
  uploadLogo(
    @Param('requestId') requestId: string,
    @UploadedFile() file: Express.Multer.File,
    @Headers('x-mercai-user-id') callerUserId?: string,
  ) {
    if (!file) throw new BadRequestException('Выберите файл логотипа');
    return this.assetsService.createFromUpload(requestId, file, AssetType.logo, callerUserId ?? null);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('reference')
  @UseInterceptors(FileInterceptor('file', assetMulterOptions()))
  uploadReference(
    @Param('requestId') requestId: string,
    @UploadedFile() file: Express.Multer.File,
    @Headers('x-mercai-user-id') callerUserId?: string,
  ) {
    if (!file) throw new BadRequestException('Выберите файл референса');
    return this.assetsService.createFromUpload(requestId, file, AssetType.reference, callerUserId ?? null);
  }
}
