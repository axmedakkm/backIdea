import { Type, applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { PaginationMeta } from '../dto/api-response.dto';

/**
 * Documents a list endpoint returning the standard envelope with `meta`.
 * Saves repeating the same inline schema on every paginated route.
 */
export const ApiPaginatedResponse = <TModel extends Type<unknown>>(
  model: TModel,
  description = 'Paginated results',
) =>
  applyDecorators(
    ApiExtraModels(model, PaginationMeta),
    ApiOkResponse({
      description,
      schema: {
        type: 'object',
        required: ['success', 'message', 'data', 'meta'],
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Records retrieved successfully' },
          data: { type: 'array', items: { $ref: getSchemaPath(model) } },
          meta: { $ref: getSchemaPath(PaginationMeta) },
        },
      },
    }),
  );
