import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { CatalogExternalImageController } from './catalog-external-image.controller';

@Module({
  controllers: [ProductsController, CatalogExternalImageController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
