import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Headers,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequestsService } from './requests.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateRequestDto } from './dto/update-request.dto';
import { GenerationService } from '../generation/generation.service';
import { GenerateRequestDto } from './dto/generate-request.dto';
import { RefineVisualizationDto } from './dto/refine-visualization.dto';
import { RefineVisualizationService } from '../generation/refine-visualization.service';
import { ParseBriefDto } from './dto/parse-brief.dto';

/** Лимит дорогих AI-операций: 30/час на IP (глобальный throttler "ai") */
const AI_THROTTLE = { ai: { limit: 30, ttl: 3_600_000 } };

@Controller('requests')
export class RequestsController {
  constructor(
    private readonly requestsService: RequestsService,
    private readonly generationService: GenerationService,
    private readonly refineVisualizationService: RefineVisualizationService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateRequestDto,
    @Headers('x-mercai-user-id') callerUserId?: string,
  ) {
    return this.requestsService.create(dto, callerUserId ?? null);
  }

  @Throttle(AI_THROTTLE)
  @Post('parse-brief')
  parseBrief(@Body() dto: ParseBriefDto) {
    return this.requestsService.parseBrief(dto.userPrompt);
  }

  @Throttle(AI_THROTTLE)
  @Post('parameters/extract')
  extractParametersAlias(
    @Body() body: { requestId: string },
    @Headers('x-mercai-user-id') callerUserId?: string,
  ) {
    return this.requestsService.extractParameters(body.requestId, callerUserId ?? null);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Headers('x-mercai-user-id') callerUserId?: string,
  ) {
    const request = await this.requestsService.findOne(id, callerUserId ?? null);
    if (request.status === 'generating' && request.generation?.id) {
      const generationProgress = await this.generationService.getActiveJobProgress(
        request.generation.id,
        request.generationCount,
      );
      return { ...request, generationProgress };
    }
    return request;
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRequestDto,
    @Headers('x-mercai-user-id') callerUserId?: string,
  ) {
    return this.requestsService.update(id, dto, callerUserId ?? null);
  }

  @Post(':id/submit')
  submit(
    @Param('id') id: string,
    @Headers('x-mercai-user-id') callerUserId?: string,
  ) {
    return this.requestsService.submit(id, callerUserId ?? null);
  }

  @Throttle(AI_THROTTLE)
  @Post(':id/extract-parameters')
  extractParameters(
    @Param('id') id: string,
    @Headers('x-mercai-user-id') callerUserId?: string,
  ) {
    return this.requestsService.extractParameters(id, callerUserId ?? null);
  }

  @Throttle(AI_THROTTLE)
  @Post(':id/suggest-products')
  suggestProducts(
    @Param('id') id: string,
    @Headers('x-mercai-user-id') callerUserId?: string,
  ) {
    return this.requestsService.suggestProducts(id, callerUserId ?? null);
  }

  @Throttle(AI_THROTTLE)
  @Post(':id/suggest-product-add')
  suggestProductAdd(
    @Param('id') id: string,
    @Body() body: { currentProductIds: string[]; hint?: string },
    @Headers('x-mercai-user-id') callerUserId?: string,
  ) {
    return this.requestsService.suggestProductAdd(id, body, callerUserId ?? null);
  }

  @Throttle(AI_THROTTLE)
  @Post(':id/generate')
  generate(
    @Param('id') id: string,
    @Body() dto: GenerateRequestDto,
    @Headers('x-mercai-user-id') callerUserId?: string,
  ) {
    return this.generationService.startGeneration(
      id,
      {
        debug: dto.debug ?? false,
        mode: dto.mode ?? 'mockup',
        productIds: dto.productIds,
        aiStyle: dto.aiStyle,
        chosenIdeaTitle: dto.chosenIdeaTitle,
        productTargetColors: dto.productTargetColors,
        sceneBrief: dto.sceneBrief,
        giftBoxEnabled: dto.giftBoxEnabled,
      },
      callerUserId ?? null,
    );
  }

  @Throttle(AI_THROTTLE)
  @Post(':id/regenerate')
  regenerate(
    @Param('id') id: string,
    @Body() dto: GenerateRequestDto,
    @Headers('x-mercai-user-id') callerUserId?: string,
  ) {
    return this.generationService.regenerateGeneration(
      id,
      {
        debug: dto.debug ?? false,
        mode: dto.mode ?? 'mockup',
        productIds: dto.productIds,
        aiStyle: dto.aiStyle,
        chosenIdeaTitle: dto.chosenIdeaTitle,
        productTargetColors: dto.productTargetColors,
        sceneBrief: dto.sceneBrief,
        giftBoxEnabled: dto.giftBoxEnabled,
      },
      callerUserId ?? null,
    );
  }

  @Throttle(AI_THROTTLE)
  @Post(':id/refine-visualization')
  refineVisualization(
    @Param('id') id: string,
    @Body() dto: RefineVisualizationDto,
    @Headers('x-mercai-user-id') callerUserId?: string,
  ) {
    return this.refineVisualizationService.startRefinement(
      id,
      {
        refinementBrief: dto.refinementBrief,
        sourceImageUrl: dto.sourceImageUrl,
        chosenIdeaTitle: dto.chosenIdeaTitle,
      },
      callerUserId ?? null,
    );
  }
}
