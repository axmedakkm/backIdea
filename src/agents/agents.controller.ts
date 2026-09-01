import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ApiMessage } from '../common/decorators/api-message.decorator';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiErrorResponse } from '../common/dto/api-response.dto';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { AgentsService } from './agents.service';
import { QueryAgentDto } from './dto/query-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { AgentEntity } from './entities/agent.entity';

@ApiTags('Agents')
@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Public()
  @Get()
  @ApiMessage('Agents retrieved successfully')
  @ApiOperation({
    summary: 'List agents',
    description:
      'Public directory of active agents. Filter by location, city, verification status or ' +
      'minimum rating, and sort by rating, listing count, review count or join date.',
  })
  @ApiPaginatedResponse(AgentEntity, 'Paginated list of agents')
  @ApiBadRequestResponse({ description: 'Invalid query parameters', type: ApiErrorResponse })
  findAll(@Query() query: QueryAgentDto) {
    return this.agentsService.findAll(query);
  }

  @Public()
  @Get(':id')
  @ApiMessage('Agent retrieved successfully')
  @ApiOperation({
    summary: 'Get an agent profile',
    description:
      'Public endpoint returning the agent profile together with contact details, ' +
      'average rating, review count and published listing count.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Agent ID' })
  @ApiOkResponse({ description: 'Agent found', type: AgentEntity })
  @ApiBadRequestResponse({ description: 'Malformed UUID', type: ApiErrorResponse })
  @ApiNotFoundResponse({ description: 'Agent not found', type: ApiErrorResponse })
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.agentsService.findOne(id);
  }

  @Roles(UserRole.AGENT, UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @Patch(':id')
  @ApiMessage('Agent profile updated successfully')
  @ApiOperation({
    summary: 'Update an agent profile',
    description:
      'An AGENT may update only their own profile; an ADMIN may update any profile. ' +
      'Rating, review count, listing count and verification status are system-managed ' +
      'and cannot be set here.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Agent ID' })
  @ApiBody({ type: UpdateAgentDto })
  @ApiOkResponse({ description: 'Agent profile updated', type: AgentEntity })
  @ApiBadRequestResponse({ description: 'Validation failed or empty body', type: ApiErrorResponse })
  @ApiUnauthorizedResponse({ description: 'Authentication required', type: ApiErrorResponse })
  @ApiForbiddenResponse({
    description: 'Attempted to update another agent profile',
    type: ApiErrorResponse,
  })
  @ApiNotFoundResponse({ description: 'Agent not found', type: ApiErrorResponse })
  @ApiConflictResponse({ description: 'Licence number already in use', type: ApiErrorResponse })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateAgentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.agentsService.update(id, dto, actor);
  }
}
