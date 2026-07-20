import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { RequestsService } from '../requests/requests.service';
import { AssetType, RequestStatus } from '@prisma/client';
import { validateUploadedImageFile } from './file-type.util';
import { getUploadsDir } from './upload.config';

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestsService: RequestsService,
  ) {}

  async createFromUpload(
    requestId: string,
    file: Express.Multer.File,
    type: AssetType,
    callerUserId?: string | null,
  ) {
    const request = await this.requestsService.findOne(requestId, callerUserId);
    const editable: RequestStatus[] = [RequestStatus.draft, RequestStatus.done, RequestStatus.failed];
    if (!editable.includes(request.status)) {
      throw new ForbiddenException('Assets cannot be uploaded while generation is in progress');
    }

    const ext = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();
    const diskPath = join(getUploadsDir(), 'assets', file.filename);
    const valid = await validateUploadedImageFile(diskPath, ext);
    if (!valid) {
      await unlink(diskPath).catch(() => undefined);
      throw new BadRequestException('Файл повреждён или формат не совпадает с расширением');
    }

    if (type === AssetType.logo) {
      await this.prisma.asset.deleteMany({ where: { requestId, type: AssetType.logo } });
    }

    const url = `/uploads/assets/${file.filename}`;
    return this.prisma.asset.create({
      data: { requestId, type, url },
    });
  }
}
