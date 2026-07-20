import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { isSvgUploadAllowed } from './file-type.util';

const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
]);

const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.pdf']);

if (isSvgUploadAllowed()) {
  ALLOWED_MIME.add('image/svg+xml');
  ALLOWED_EXT.add('.svg');
}

export function getUploadsDir() {
  return process.env.UPLOADS_DIR || join(process.cwd(), '../../uploads');
}

export function assetMulterOptions() {
  return {
    storage: diskStorage({
      destination: (_req: unknown, _file: Express.Multer.File, cb: (e: Error | null, d: string) => void) => {
        cb(null, join(getUploadsDir(), 'assets'));
      },
      filename: (_req: unknown, file: Express.Multer.File, cb: (e: Error | null, n: string) => void) => {
        cb(null, `${uuidv4()}${extname(file.originalname).toLowerCase()}`);
      },
    }),
    limits: { fileSize: MAX_BYTES, files: 1 },
    fileFilter: (
      _req: unknown,
      file: Express.Multer.File,
      cb: (e: Error | null, ok: boolean) => void,
    ) => {
      const ext = extname(file.originalname).toLowerCase();
      if (ext === '.svg' && !isSvgUploadAllowed()) {
        return cb(
          new BadRequestException('SVG uploads are disabled in production. Use PNG, JPG or WEBP.'),
          false,
        );
      }
      if (!ALLOWED_MIME.has(file.mimetype) && !ALLOWED_EXT.has(ext)) {
        return cb(
          new BadRequestException(
            'Допустимые форматы: PNG, JPG, WEBP, PDF (до 10 МБ)',
          ),
          false,
        );
      }
      cb(null, true);
    },
  };
}
