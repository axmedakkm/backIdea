import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ApiMessage } from '../common/decorators/api-message.decorator';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated-response.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ApiErrorResponse } from '../common/dto/api-response.dto';
import { QueryReviewDto } from './dto/query-review.dto';
import { AgentRatingSummary, ReviewEntity } from './entities/review.entity';
import { ReviewsService } from './reviews.service';

/** Serves the agent-scoped review routes required by the public API. */
@ApiTags('Reviews')
@Controller('agents')
export class AgentReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Public()
  @Get(':agentId/reviews')
  @ApiMessage('Agent reviews retrieved successfully')
  @ApiOperation({
    summary: 'List reviews for an agent',
    description:
      'Public endpoint. Filter by an exact star rating and sort by date or rating. ' +
      'Deleted reviews are excluded.',
  })
  @ApiParam({ name: 'agentId', format: 'uuid', description: 'Agent ID' })
  @ApiPaginatedResponse(ReviewEntity, 'Paginated list of reviews for the agent')
  @ApiBadRequestResponse({ description: 'Invalid query parameters', type: ApiErrorResponse })
  @ApiNotFoundResponse({ description: 'Agent not found', type: ApiErrorResponse })
  findByAgent(
    @Param('agentId', new ParseUUIDPipe({ version: '4' })) agentId: string,
    @Query() query: QueryReviewDto,
  ) {
    return this.reviewsService.findByAgent(agentId, query);
  }

  @Public()
  @Get(':agentId/rating')
  @ApiMessage('Agent rating retrieved successfully')
  @ApiOperation({
    summary: 'Get an agent rating breakdown',
    description:
      'Public endpoint returning the average rating, total review count and the ' +
      'number of reviews at each star level.',
  })
  @ApiParam({ name: 'agentId', format: 'uuid', description: 'Agent ID' })
  @ApiOkResponse({ description: 'Rating summary', type: AgentRatingSummary })
  @ApiNotFoundResponse({ description: 'Agent not found', type: ApiErrorResponse })
  ratingSummary(@Param('agentId', new ParseUUIDPipe({ version: '4' })) agentId: string) {
    return this.reviewsService.ratingSummary(agentId);
  }
}
