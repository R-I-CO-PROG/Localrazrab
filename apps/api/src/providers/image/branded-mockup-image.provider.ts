import { Injectable, Logger } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { ImageProvider, ImageGenerationInput } from './image.interface';

import { composeBrandedMockup } from '../../generation/branded-mockup.composer';



@Injectable()

export class BrandedMockupImageProvider implements ImageProvider {

  private readonly logger = new Logger(BrandedMockupImageProvider.name);



  constructor(private readonly config: ConfigService) {}



  async generate(input: ImageGenerationInput): Promise<string> {

    const products =

      input.products ??

      (input.productNames ?? []).map((name, i) => ({

        name,

        imageUrl:

          input.catalogImageUrls?.[i] ??

          input.silhouetteUrls?.[i] ??

          '',

      }));



    this.logger.log(

      `Branded mockup: ${products.length} products, logo=${Boolean(input.logoUrl)}`,

    );



    const result = await composeBrandedMockup({

      outputPath: input.outputPath,

      width: Number(this.config.get('MOCKUP_WIDTH')) || input.width || 1024,

      height: Number(this.config.get('MOCKUP_HEIGHT')) || input.height || 1024,

      products,

      colors: input.colors,

      logoUrl: input.logoUrl,

      category: input.category,

      quantity: input.quantity,

      showLabels: input.showLabels,
      layoutMode: input.layoutMode,

    });



    this.logger.log(

      `Mockup saved: ${result.productCount} items, logo per product=${result.logoAppliedPerProduct}`,

    );



    return input.outputPath;

  }

}


