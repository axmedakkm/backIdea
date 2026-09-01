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
import { UserRole } from '@prisma/client';
import { MessageOnlyEntity } from '../auth/entities/auth-response.entity';
import { ApiMessage } from '../common/decorators/api-message.decorator';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated-response.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiErrorResponse } from '../common/dto/api-response.dto';
import { CreateLocationDto } from './dto/create-location.dto';
import { QueryLocationDto } from './dto/query-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { LocationEntity } from './entities/location.entity';
import { LocationsService } from './locations.service';

@ApiTags('Locations')
@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiMessage('Location created successfully')
  @ApiOperation({
    summary: 'Create a location',
    description:
      'ADMIN only. The combination of country, city and district must be unique; ' +
      'the slug is derived from those three fields.',
  })
  @ApiBody({ type: CreateLocationDto })
  @ApiCreatedResponse({ description: 'Location created', type: LocationEntity })
  @ApiBadRequestResponse({ description: 'Validation failed', type: ApiErrorResponse })
  @ApiUnauthorizedResponse({ description: 'Authentication required', type: ApiErrorResponse })
  @ApiForbiddenResponse({ description: 'ADMIN role required', type: ApiErrorResponse })
  @ApiConflictResponse({ description: 'Location already exists', type: ApiErrorResponse })
  create(@Body() dto: CreateLocationDto) {
    return this.locationsService.create(dto);
  }

  @Public()
  @Get()
  @ApiMessage('Locations retrieved successfully')
  @ApiOperation({
    summary: 'List locations',
    description:
      'Public endpoint. Filter by country, city, district or a free-text search across all three. ' +
      'Supports pagination and sorting.',
  })
  @ApiPaginatedResponse(LocationEntity, 'Paginated list of locations')
  @ApiBadRequestResponse({ description: 'Invalid query parameters', type: ApiErrorResponse })
  findAll(@Query() query: QueryLocationDto) {
    return this.locationsService.findAll(query);
  }

  @Public()
  @Get(':id')
  @ApiMessage('Location retrieved successfully')
  @ApiOperation({ summary: 'Get a single location by ID', description: 'Public endpoint.' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Location ID' })
  @ApiOkResponse({ description: 'Location found', type: LocationEntity })
  @ApiBadRequestResponse({ description: 'Malformed UUID', type: ApiErrorResponse })
  @ApiNotFoundResponse({ description: 'Location not found', type: ApiErrorResponse })
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.locationsService.findOne(id);
  }

  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @Patch(':id')
  @ApiMessage('Location updated successfully')
  @ApiOperation({
    summary: 'Update a location',
    description: 'ADMIN only. Changing country, city or district regenerates the slug.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Location ID' })
  @ApiBody({ type: UpdateLocationDto })
  @ApiOkResponse({ description: 'Location updated', type: LocationEntity })
  @ApiBadRequestResponse({ description: 'Validation failed or empty body', type: ApiErrorResponse })
  @ApiUnauthorizedResponse({ description: 'Authentication required', type: ApiErrorResponse })
  @ApiForbiddenResponse({ description: 'ADMIN role required', type: ApiErrorResponse })
  @ApiNotFoundResponse({ description: 'Location not found', type: ApiErrorResponse })
  @ApiConflictResponse({ description: 'Location already exists', type: ApiErrorResponse })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.locationsService.update(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Location deleted successfully')
  @ApiOperation({
    summary: 'Delete a location',
    description: 'ADMIN only. Soft delete, so properties referencing it stay intact.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Location ID' })
  @ApiOkResponse({ description: 'Location deleted', type: MessageOnlyEntity })
  @ApiUnauthorizedResponse({ description: 'Authentication required', type: ApiErrorResponse })
  @ApiForbiddenResponse({ description: 'ADMIN role required', type: ApiErrorResponse })
  @ApiNotFoundResponse({ description: 'Location not found', type: ApiErrorResponse })
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.locationsService.remove(id);
  }
}
