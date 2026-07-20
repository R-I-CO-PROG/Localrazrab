import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../security/public.decorator';
import { PANEL_HTML } from './panel.html';

/** Локальная dev-панель для ручного прогона пайплайна подбора без фронтенда. Не для прода. */
@Controller('panel')
export class PanelController {
  @Public()
  @Get()
  render(@Res() res: Response) {
    // Глобальный CSP (helmet, main.ts) блокирует инлайн style/script — эта страница их использует
    // как самодостаточная dev-панель без сборки, поэтому переопределяем CSP только на этом роуте.
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data: http: https:; connect-src 'self'",
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(PANEL_HTML);
  }
}
