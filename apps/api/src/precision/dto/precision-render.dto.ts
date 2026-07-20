import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class PlacementDto {
  @IsNumber() @Min(0) @Max(1) cx!: number;
  @IsNumber() @Min(0) @Max(1) cy!: number;
  @IsNumber() @Min(0) @Max(2) w!: number;
  @IsNumber() @Min(0) @Max(2) h!: number;
  @IsNumber() @Min(-180) @Max(180) rotation!: number;
}

export class SizeMmDto {
  @IsNumber() @Min(1) @Max(2000) w!: number;
  @IsNumber() @Min(1) @Max(2000) h!: number;
}

export class ImprintDto {
  @IsIn(['logo', 'text']) contentKind!: 'logo' | 'text';

  /** Asset.id логотипа; обязателен при contentKind === 'logo' */
  @IsOptional() @IsString() assetId?: string;

  /** Обязателен при contentKind === 'text' */
  @IsOptional() @IsString() text?: string;

  @IsOptional() @IsString() font?: string;

  @IsOptional() @IsString() zoneId?: string;

  @IsString() methodCode!: string;

  @IsInt() @Min(1) @Max(8) colorCount!: number;

  @IsOptional() @IsString() colorHex?: string;

  @IsOptional() @ValidateNested() @Type(() => SizeMmDto) sizeMm?: SizeMmDto;

  @ValidateNested() @Type(() => PlacementDto) placement!: PlacementDto;
}

export class PrecisionRenderDto {
  @IsIn(['edit', 'studio']) outputMode!: 'edit' | 'studio';

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => ImprintDto)
  imprints!: ImprintDto[];
}
