import { IsOptional, IsString, IsInt, IsArray, IsBoolean, Min, Max, MaxLength } from 'class-validator';

export class CreateRequestDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1500, { message: 'Описание задачи — не более 1500 символов' })
  userPrompt?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50_000_000)
  budgetMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50_000_000)
  budgetMax?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  colors?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedItems?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  forbiddenItems?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  setItemCount?: number;

  @IsOptional()
  useProductCountLimit?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  minProductsPerSet?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxProductsPerSet?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  conceptCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  visualizationCount?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  blacklistedProductIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  blacklistedSupplierIds?: string[];
}
