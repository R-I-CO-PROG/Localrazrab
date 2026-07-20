import { IsArray, IsBoolean, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ProductTargetColorDto } from './product-target-color.dto';

export class GenerateRequestDto {
  @IsOptional()
  @IsBoolean()
  debug?: boolean;

  @IsOptional()
  @IsIn(['mockup', 'ai'])
  mode?: 'mockup' | 'ai';

  /** Актуальный выбор товаров из UI (синхронизируется даже если request уже ready) */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];

  /** catalog = товары из каталога; creative = генерация с нуля по промпту */
  @IsOptional()
  @IsIn(['catalog', 'creative'])
  aiStyle?: 'catalog' | 'creative';

  /** Выбранная концепция (креативный режим, после Ideator+Critic) */
  @IsOptional()
  @IsString()
  chosenIdeaTitle?: string;

  /** Целевой цвет SKU для визуализации (только если цвет есть в карточке товара) */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductTargetColorDto)
  productTargetColors?: ProductTargetColorDto[];

  /** Доп. пожелания к сцене (креатив): композиция, ракурс, свет, фон, настроение */
  @IsOptional()
  @IsString()
  sceneBrief?: string;

  /** Собирать фото набора в подарочной коробке (ложемент). По умолчанию включено. */
  @IsOptional()
  @IsBoolean()
  giftBoxEnabled?: boolean;
}
