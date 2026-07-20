import { IsOptional, IsString, MinLength } from 'class-validator';

export class RefineVisualizationDto {
  @IsString()
  @MinLength(8)
  refinementBrief!: string;

  @IsOptional()
  @IsString()
  sourceImageUrl?: string;

  @IsOptional()
  @IsString()
  chosenIdeaTitle?: string;
}
