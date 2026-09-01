import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { ApiMessage } from '../common/decorators/api-message.decorator';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ApiErrorResponse } from '../common/dto/api-response.dto';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { QueryPropertyDto } from './dto/query-property.dto';
import { PropertyEntity } from './entities/property.entity';
import { PropertiesService } from './properties.service';

/**
 * Lives in the properties module (rather than the agents module) so the agent
 * listing route can reuse PropertiesService without a circular import.
 */
@ApiTags('Agents')
@Controller('agents')
export class AgentPropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get(':id/properties')
  @ApiMessage('Agent properties retrieved successfully')
  @ApiOperation({
    summary: "List an agent's properties",
    description:
      'Public endpoint supporting the same filters, pagination and sorting as ' +
      '`GET /properties`. Anonymous callers see approved, published listings only; ' +
      'the agent themselves and admins additionally see drafts and pending listings.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Agent ID' })
  @ApiPaginatedResponse(PropertyEntity, "Paginated list of the agent's properties")
  @ApiBadRequestResponse({ description: 'Invalid query parameters', type: ApiErrorResponse })
  @ApiNotFoundResponse({ description: 'Agent not found', type: ApiErrorResponse })
  findByAgent(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() query: QueryPropertyDto,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.propertiesService.findByAgent(id, query, actor);
  }
}
