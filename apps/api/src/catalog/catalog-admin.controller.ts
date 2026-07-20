import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import {
  getCriticRuntimeEnabled,
  setCriticRuntimeEnabled,
} from '../providers/llm/catalog-llm-set-critic.util';
import { CatalogAdminService } from './catalog-admin.service';

@Controller('catalog')
export class CatalogAdminController {
  constructor(private readonly catalog: CatalogAdminService) {}

  @Get('tree')
  getTree() {
    return this.catalog.getTree();
  }

  @Get('paths')
  getPaths() {
    return { paths: this.catalog.getPaths() };
  }

  @Get('products')
  getProducts(
    @Query('path') path = '',
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '60',
    @Query('q') q = '',
    @Query('site') site = '',
  ) {
    return this.catalog.getProducts({
      path,
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(200, Number(pageSize) || 60),
      q,
      site,
    });
  }

  @Get('search')
  search(@Query('q') q = '') {
    return this.catalog.search(q);
  }

  @Post('move-products')
  moveProducts(@Body() body: { skus?: string[]; target?: string }) {
    return this.wrap(() =>
      this.catalog.moveProducts(body.skus || [], body.target || ''),
    );
  }

  @Post('move-category')
  moveCategory(@Body() body: { from?: string; to?: string }) {
    return this.wrap(() => this.catalog.moveCategory(body.from || '', body.to || ''));
  }

  @Post('rename-category')
  renameCategory(@Body() body: { path?: string; newName?: string }) {
    return this.wrap(() =>
      this.catalog.renameCategory(body.path || '', body.newName || ''),
    );
  }

  @Post('create-category')
  createCategory(@Body() body: { path?: string }) {
    return this.wrap(() => this.catalog.createCategory(body.path || ''));
  }

  @Post('delete-category')
  deleteCategory(@Body() body: { path?: string; mode?: 'merge-up' | 'to-uncategorized' }) {
    return this.wrap(() =>
      this.catalog.deleteCategory(body.path || '', body.mode || 'merge-up'),
    );
  }

  @Post('reset')
  reset() {
    return this.wrap(() => this.catalog.reset(true));
  }

  @Post('export')
  async exportToSite() {
    try {
      return await this.catalog.exportToSite();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new HttpException({ error: message }, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('snapshot')
  snapshot(@Body() body: { reason?: string }) {
    return this.wrap(() => this.catalog.takeSnapshot(body.reason || 'manual'));
  }

  /** Включить / выключить LLM-критик на лету (без перезапуска).
   *  enabled=true|false — явно; enabled=null — вернуться к значению CATALOG_LLM_CRITIC из .env */
  @Post('critic-toggle')
  criticToggle(@Body() body: { enabled?: boolean | null }) {
    const val = body.enabled === true ? true : body.enabled === false ? false : null;
    setCriticRuntimeEnabled(val);
    return { critic: getCriticRuntimeEnabled(), source: val === null ? 'env' : 'runtime' };
  }

  @Get('critic-status')
  criticStatus() {
    return { critic: getCriticRuntimeEnabled(), source: getCriticRuntimeEnabled() === null ? 'env' : 'runtime' };
  }

  private wrap<T>(fn: () => T) {
    try {
      return fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status =
        err instanceof HttpException ? err.getStatus() : HttpStatus.BAD_REQUEST;
      throw new HttpException({ error: message }, status);
    }
  }
}
