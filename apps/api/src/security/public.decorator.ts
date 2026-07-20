import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/** Маршрут без API-ключа (только liveness и т.п.) */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
