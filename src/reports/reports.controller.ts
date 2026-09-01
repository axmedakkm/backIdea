import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiMessage } from '../common/decorators/api-message.decorator';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrorResponse } from '../common/dto/api-response.dto';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { CreateReportDto } from './dto/create-report.dto';
import { QueryReportDto } from './dto/query-report.dto';
import { ReportEntity } from './entities/report.entity';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Authentication required', type: ApiErrorResponse })
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiMessage('Report submitted successfully')
  @ApiOperation({
    summary: 'Report a property, agent, user or review',
    description:
      'Any signed-in user may file a report. The reported entity must exist, you cannot ' +
      'report yourself or your own content, and you may report a given item only once. ' +
      'Reports enter the moderation queue with status PENDING and are reviewed by admins ' +
      'via `/admin/reports`.',
  })
  @ApiBody({ type: CreateReportDto })
  @ApiCreatedResponse({ description: 'Report submitted', type: ReportEntity })
  @ApiBadRequestResponse({
    description: 'Validation failed, or attempted to report your own content',
    type: ApiErrorResponse,
  })
  @ApiNotFoundResponse({ description: 'Reported entity not found', type: ApiErrorResponse })
  @ApiConflictResponse({ description: 'You already reported this item', type: ApiErrorResponse })
  create(@Body() dto: CreateReportDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.reportsService.create(dto, actor);
  }

  @Get('mine')
  @ApiMessage('Reports retrieved successfully')
  @ApiOperation({
    summary: 'List reports you have filed',
    description:
      'Returns your own reports and their current moderation status. ' +
      'Use `/admin/reports` for the full queue (ADMIN only).',
  })
  @ApiPaginatedResponse(ReportEntity, 'Paginated list of your reports')
  @ApiBadRequestResponse({ description: 'Invalid query parameters', type: ApiErrorResponse })
  findMine(@CurrentUser() actor: AuthenticatedUser, @Query() query: QueryReportDto) {
    return this.reportsService.findMine(actor, query);
  }
}
