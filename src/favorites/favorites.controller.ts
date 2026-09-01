import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { MessageOnlyEntity } from '../auth/entities/auth-response.entity';
import { ApiMessage } from '../common/decorators/api-message.decorator';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrorResponse } from '../common/dto/api-response.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PropertyEntity } from '../properties/entities/property.entity';
import { FavoritesService } from './favorites.service';

@ApiTags('Favorites')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Authentication required', type: ApiErrorResponse })
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  @ApiMessage('Favorites retrieved successfully')
  @ApiOperation({
    summary: 'List your saved properties',
    description:
      'Returns the full property record for each saved listing, newest first. ' +
      'Listings deleted after being saved are omitted.',
  })
  @ApiPaginatedResponse(PropertyEntity, 'Paginated list of favourited properties')
  @ApiBadRequestResponse({ description: 'Invalid query parameters', type: ApiErrorResponse })
  findAll(@CurrentUser('id') userId: string, @Query() query: PaginationQueryDto) {
    return this.favoritesService.findAll(userId, query);
  }

  @Post(':propertyId')
  @HttpCode(HttpStatus.CREATED)
  @ApiMessage('Property added to favorites')
  @ApiOperation({
    summary: 'Save a property to your favourites',
    description:
      'A unique (userId, propertyId) constraint prevents duplicates — saving the same ' +
      'listing twice returns 409. The listing agent receives a PROPERTY_FAVORITED notification.',
  })
  @ApiParam({ name: 'propertyId', format: 'uuid', description: 'Property to save' })
  @ApiCreatedResponse({ description: 'Property saved', type: MessageOnlyEntity })
  @ApiBadRequestResponse({ description: 'Malformed UUID', type: ApiErrorResponse })
  @ApiNotFoundResponse({
    description: 'Property not found or not publicly available',
    type: ApiErrorResponse,
  })
  @ApiConflictResponse({ description: 'Property already saved', type: ApiErrorResponse })
  add(
    @CurrentUser('id') userId: string,
    @Param('propertyId', new ParseUUIDPipe({ version: '4' })) propertyId: string,
  ) {
    return this.favoritesService.add(userId, propertyId);
  }

  @Delete(':propertyId')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Property removed from favorites')
  @ApiOperation({
    summary: 'Remove a property from your favourites',
    description: 'Removes the saved listing. Returns 404 when it was not saved.',
  })
  @ApiParam({ name: 'propertyId', format: 'uuid', description: 'Property to unsave' })
  @ApiOkResponse({ description: 'Property removed', type: MessageOnlyEntity })
  @ApiNotFoundResponse({ description: 'Property was not in your favourites', type: ApiErrorResponse })
  remove(
    @CurrentUser('id') userId: string,
    @Param('propertyId', new ParseUUIDPipe({ version: '4' })) propertyId: string,
  ) {
    return this.favoritesService.remove(userId, propertyId);
  }
}
