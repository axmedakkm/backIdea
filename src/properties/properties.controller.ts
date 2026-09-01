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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { MessageOnlyEntity } from '../auth/entities/auth-response.entity';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { ApiMessage } from '../common/decorators/api-message.decorator';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiErrorResponse } from '../common/dto/api-response.dto';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { ComparePropertiesDto } from './dto/compare-properties.dto';
import { CreatePropertyDto } from './dto/create-property.dto';
import { QueryPropertyDto } from './dto/query-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { PropertyEntity } from './entities/property.entity';
import { PropertiesService } from './properties.service';

@ApiTags('Properties')
@Controller('properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Roles(UserRole.AGENT, UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiMessage('Property created successfully')
  @ApiOperation({
    summary: 'Create a property listing',
    description:
      'AGENT and ADMIN only. An agent always creates listings under their own profile; ' +
      'an admin must supply `agentId`. Setting `isPublished: true` submits the listing ' +
      'for moderation (status PENDING) rather than publishing it immediately.',
  })
  @ApiBody({ type: CreatePropertyDto })
  @ApiOkResponse({ description: 'Property created', type: PropertyEntity })
  @ApiBadRequestResponse({
    description: 'Validation failed, or category/location does not exist',
    type: ApiErrorResponse,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required', type: ApiErrorResponse })
  @ApiForbiddenResponse({
    description: 'AGENT or ADMIN role required, or no agent profile on the account',
    type: ApiErrorResponse,
  })
  create(@Body() dto: CreatePropertyDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.propertiesService.create(dto, actor);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get()
  @ApiMessage('Properties retrieved successfully')
  @ApiOperation({
    summary: 'Search and list properties',
    description:
      'Public endpoint with optional authentication. Anonymous callers see approved, ' +
      'published listings only; an agent additionally sees all of their own listings at any ' +
      'status, and an admin sees everything. Supplying a token also populates `isFavorited` ' +
      'on each result.\n\n' +
      'Combine any of the filters below with pagination and sorting, for example:\n' +
      '`?purpose=SALE&propertyType=APARTMENT&minPrice=100000&maxPrice=300000&bedrooms=3&page=1&limit=20`',
  })
  @ApiPaginatedResponse(PropertyEntity, 'Paginated list of matching properties')
  @ApiBadRequestResponse({ description: 'Invalid query parameters', type: ApiErrorResponse })
  findAll(@Query() query: QueryPropertyDto, @CurrentUser() actor?: AuthenticatedUser) {
    return this.propertiesService.findAll(query, actor);
  }

  // Declared before `:id` so "compare" is not captured as a UUID path parameter.
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('compare')
  @ApiMessage('Properties compared successfully')
  @ApiOperation({
    summary: 'Compare properties side by side',
    description:
      'Returns 2 to 4 listings in the order requested, each with price, area, bedrooms, ' +
      'bathrooms, property type, purpose, location, parking and features, so a client can ' +
      'render a comparison table. Only publicly visible listings can be compared.',
  })
  @ApiQuery({
    name: 'ids',
    required: true,
    type: String,
    description: 'Comma-separated list of 2 to 4 property IDs',
    example: '3f2504e0-4f89-11d3-9a0c-0305e82c3301,6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  })
  @ApiOkResponse({ description: 'Comparison payload', type: [PropertyEntity] })
  @ApiBadRequestResponse({
    description: 'Fewer than 2, more than 4, or malformed IDs',
    type: ApiErrorResponse,
  })
  @ApiNotFoundResponse({
    description: 'One or more properties do not exist or are not available',
    type: ApiErrorResponse,
  })
  compare(@Query() query: ComparePropertiesDto, @CurrentUser() actor?: AuthenticatedUser) {
    return this.propertiesService.compare(query.ids, actor);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('slug/:slug')
  @ApiMessage('Property retrieved successfully')
  @ApiOperation({
    summary: 'Get a property by its slug',
    description:
      'SEO-friendly lookup used by listing detail pages. Increments the view counter, ' +
      'except when the listing owner or an admin is viewing.',
  })
  @ApiParam({
    name: 'slug',
    description: 'URL-safe listing identifier',
    example: 'sunlit-two-bedroom-in-williamsburg',
  })
  @ApiOkResponse({ description: 'Property found', type: PropertyEntity })
  @ApiNotFoundResponse({ description: 'Property not found', type: ApiErrorResponse })
  findBySlug(@Param('slug') slug: string, @CurrentUser() actor?: AuthenticatedUser) {
    return this.propertiesService.findBySlug(slug, actor);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get(':id')
  @ApiMessage('Property retrieved successfully')
  @ApiOperation({
    summary: 'Get a property by ID',
    description:
      'Returns the full listing including agent, category, location, images and features. ' +
      'Unapproved listings are visible only to their owner and to admins.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Property ID' })
  @ApiOkResponse({ description: 'Property found', type: PropertyEntity })
  @ApiBadRequestResponse({ description: 'Malformed UUID', type: ApiErrorResponse })
  @ApiNotFoundResponse({ description: 'Property not found', type: ApiErrorResponse })
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.propertiesService.findOne(id, actor);
  }

  @Roles(UserRole.AGENT, UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @Patch(':id')
  @ApiMessage('Property updated successfully')
  @ApiOperation({
    summary: 'Update a property listing',
    description:
      'An AGENT may update only their own listings; an ADMIN may update any listing. ' +
      'Supplying `features` replaces the existing feature set. Re-publishing a listing that ' +
      'is not yet approved returns it to PENDING moderation.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Property ID' })
  @ApiBody({ type: UpdatePropertyDto })
  @ApiOkResponse({ description: 'Property updated', type: PropertyEntity })
  @ApiBadRequestResponse({ description: 'Validation failed or empty body', type: ApiErrorResponse })
  @ApiUnauthorizedResponse({ description: 'Authentication required', type: ApiErrorResponse })
  @ApiForbiddenResponse({
    description: 'Listing belongs to another agent, or admin-only status requested',
    type: ApiErrorResponse,
  })
  @ApiNotFoundResponse({ description: 'Property not found', type: ApiErrorResponse })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdatePropertyDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.propertiesService.update(id, dto, actor);
  }

  @Roles(UserRole.AGENT, UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Property deleted successfully')
  @ApiOperation({
    summary: 'Delete a property listing',
    description:
      'An AGENT may delete only their own listings; an ADMIN may delete any. ' +
      'Soft delete, so appointments and conversations referencing the listing remain valid.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Property ID' })
  @ApiOkResponse({ description: 'Property deleted', type: MessageOnlyEntity })
  @ApiUnauthorizedResponse({ description: 'Authentication required', type: ApiErrorResponse })
  @ApiForbiddenResponse({ description: 'Listing belongs to another agent', type: ApiErrorResponse })
  @ApiNotFoundResponse({ description: 'Property not found', type: ApiErrorResponse })
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.propertiesService.remove(id, actor);
  }
}
