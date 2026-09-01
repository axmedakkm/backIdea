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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { QueryCategoryDto } from './dto/query-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryEntity } from './entities/category.entity';

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiMessage('Category created successfully')
  @ApiOperation({
    summary: 'Create a category',
    description: 'ADMIN only. The slug is generated automatically from the name.',
  })
  @ApiBody({ type: CreateCategoryDto })
  @ApiCreatedResponse({ description: 'Category created', type: CategoryEntity })
  @ApiBadRequestResponse({ description: 'Validation failed', type: ApiErrorResponse })
  @ApiUnauthorizedResponse({ description: 'Authentication required', type: ApiErrorResponse })
  @ApiForbiddenResponse({ description: 'ADMIN role required', type: ApiErrorResponse })
  @ApiConflictResponse({ description: 'Category name already in use', type: ApiErrorResponse })
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Public()
  @Get()
  @ApiMessage('Categories retrieved successfully')
  @ApiOperation({
    summary: 'List categories',
    description:
      'Public endpoint. Supports search, active-state filtering, pagination and sorting. ' +
      'Each item includes the number of published, approved properties in that category.',
  })
  @ApiPaginatedResponse(CategoryEntity, 'Paginated list of categories')
  @ApiBadRequestResponse({ description: 'Invalid query parameters', type: ApiErrorResponse })
  findAll(@Query() query: QueryCategoryDto) {
    return this.categoriesService.findAll(query);
  }

  @Public()
  @Get(':id')
  @ApiMessage('Category retrieved successfully')
  @ApiOperation({ summary: 'Get a single category by ID', description: 'Public endpoint.' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Category ID' })
  @ApiOkResponse({ description: 'Category found', type: CategoryEntity })
  @ApiBadRequestResponse({ description: 'Malformed UUID', type: ApiErrorResponse })
  @ApiNotFoundResponse({ description: 'Category not found', type: ApiErrorResponse })
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.categoriesService.findOne(id);
  }

  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @Patch(':id')
  @ApiMessage('Category updated successfully')
  @ApiOperation({
    summary: 'Update a category',
    description: 'ADMIN only. Renaming a category regenerates its slug.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Category ID' })
  @ApiBody({ type: UpdateCategoryDto })
  @ApiOkResponse({ description: 'Category updated', type: CategoryEntity })
  @ApiBadRequestResponse({ description: 'Validation failed or empty body', type: ApiErrorResponse })
  @ApiUnauthorizedResponse({ description: 'Authentication required', type: ApiErrorResponse })
  @ApiForbiddenResponse({ description: 'ADMIN role required', type: ApiErrorResponse })
  @ApiNotFoundResponse({ description: 'Category not found', type: ApiErrorResponse })
  @ApiConflictResponse({ description: 'Category name already in use', type: ApiErrorResponse })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Category deleted successfully')
  @ApiOperation({
    summary: 'Delete a category',
    description:
      'ADMIN only. Performs a soft delete so existing property references remain valid.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Category ID' })
  @ApiOkResponse({ description: 'Category deleted', type: MessageOnlyEntity })
  @ApiUnauthorizedResponse({ description: 'Authentication required', type: ApiErrorResponse })
  @ApiForbiddenResponse({ description: 'ADMIN role required', type: ApiErrorResponse })
  @ApiNotFoundResponse({ description: 'Category not found', type: ApiErrorResponse })
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.categoriesService.remove(id);
  }
}
