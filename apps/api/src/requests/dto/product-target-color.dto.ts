import { IsString } from 'class-validator';

export class ProductTargetColorDto {
  @IsString()
  productId!: string;

  @IsString()
  color!: string;
}
