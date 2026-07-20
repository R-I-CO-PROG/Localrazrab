import { IsString, MaxLength, MinLength } from 'class-validator';

export class ParseBriefDto {
  @IsString()
  @MinLength(8)
  @MaxLength(1500)
  userPrompt!: string;
}
