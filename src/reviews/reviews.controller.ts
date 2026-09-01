import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { MessageOnlyEntity } from '../auth/entities/auth-response.entity';
import { ApiMessage } from '../common/decorators/api-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ApiErrorResponse } from '../common/dto/api-response.dto';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewEntity } from './entities/review.entity';
import { ReviewsService } from './reviews.service';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @ApiBearerAuth('access-token')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiMessage('Review created successfully')
  @ApiOperation({
    summary: 'Review an agent',
    description:
      'Any signed-in user may review an agent, but only once per agent — a second attempt ' +
      'returns 409, so update the existing review instead. Ratings are whole numbers from ' +
      "1 to 5. Submitting a review recalculates the agent's average rating and notifies them. " +
      'You cannot review your own agent profile.',
  })
  @ApiBody({ type: CreateReviewDto })
  @ApiCreatedResponse({ description: 'Review created', type: ReviewEntity })
  @ApiBadRequestResponse({
    description: 'Rating outside 1-5, or attempted to review yourself',
    type: ApiErrorResponse,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required', type: ApiErrorResponse })
  @ApiNotFoundResponse({ description: 'Agent not found', type: ApiErrorResponse })
  @ApiConflictResponse({ description: 'You already reviewed this agent', type: ApiErrorResponse })
  create(@Body() dto: CreateReviewDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.reviewsService.create(dto, actor);
  }

  @Public()
  @Get(':id')
  @ApiMessage('Review retrieved successfully')
  @ApiOperation({ summary: 'Get a single review', description: 'Public endpoint.' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Review ID' })
  @ApiOkResponse({ description: 'Review found', type: ReviewEntity })
  @ApiNotFoundResponse({ description: 'Review not found', type: ApiErrorResponse })
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.reviewsService.findOne(id);
  }

  @ApiBearerAuth('access-token')
  @Patch(':id')
  @ApiMessage('Review updated successfully')
  @ApiOperation({
    summary: 'Update your review',
    description:
      "Only the review's author may edit it; admins may edit any review for moderation. " +
      "Changing the rating recalculates the agent's average.",
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Review ID' })
  @ApiBody({ type: UpdateReviewDto })
  @ApiOkResponse({ description: 'Review updated', type: ReviewEntity })
  @ApiBadRequestResponse({
    description: 'Validation failed, empty body, or rating outside 1-5',
    type: ApiErrorResponse,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required', type: ApiErrorResponse })
  @ApiForbiddenResponse({ description: 'Review belongs to another user', type: ApiErrorResponse })
  @ApiNotFoundResponse({ description: 'Review not found', type: ApiErrorResponse })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateReviewDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.reviewsService.update(id, dto, actor);
  }

  @ApiBearerAuth('access-token')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Review deleted successfully')
  @ApiOperation({
    summary: 'Delete your review',
    description:
      "Only the review's author may delete it; admins may delete any review for moderation. " +
      "The agent's average rating is recalculated.",
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Review ID' })
  @ApiOkResponse({ description: 'Review deleted', type: MessageOnlyEntity })
  @ApiUnauthorizedResponse({ description: 'Authentication required', type: ApiErrorResponse })
  @ApiForbiddenResponse({ description: 'Review belongs to another user', type: ApiErrorResponse })
  @ApiNotFoundResponse({ description: 'Review not found', type: ApiErrorResponse })
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.reviewsService.remove(id, actor);
  }
}
