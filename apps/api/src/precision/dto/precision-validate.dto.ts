import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, ValidateNested, ArrayMaxSize } from 'class-validator';
import type { ImprintToValidate } from '../../generation/imprint-validation';
import { ImprintDto } from './precision-render.dto';

export class PrecisionValidateDto {
  @IsOptional() @IsString() materialRu?: string;

  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => ImprintDto)
  imprints!: ImprintToValidate[];
}
