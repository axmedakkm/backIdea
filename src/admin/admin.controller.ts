import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AgentsService } from '../agents/agents.service';
import { QueryAgentDto } from '../agents/dto/query-agent.dto';
import { AgentEntity } from '../agents/entities/agent.entity';
import { AppointmentsService } from '../appointments/appointments.service';
import { QueryAppointmentDto } from '../appointments/dto/query-appointment.dto';
import { AppointmentEntity } from '../appointments/entities/appointment.entity';
import { MessageOnlyEntity, UserProfileEntity } from '../auth/entities/auth-response.entity';
import { ApiMessage } from '../common/decorators/api-message.decorator';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiErrorResponse } from '../common/dto/api-response.dto';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { QueryPropertyDto } from '../properties/dto/query-property.dto';
import { PropertyEntity } from '../properties/entities/property.entity';
import { PropertiesService } from '../properties/properties.service';
import { QueryReportDto } from '../reports/dto/query-report.dto';
import { UpdateReportDto } from '../reports/dto/update-report.dto';
import { ReportEntity } from '../reports/entities/report.entity';
import { ReportsService } from '../reports/reports.service';
import { QueryReviewDto } from '../reviews/dto/query-review.dto';
import { ReviewEntity } from '../reviews/entities/review.entity';
import { AdminService } from './admin.service';
import { AdminQueryUsersDto } from './dto/admin-query.dto';
import {
  FeaturePropertyDto,
  RejectPropertyDto,
  SetUserActiveDto,
  VerifyAgentDto,
} from './dto/moderate-property.dto';
import { AdminDashboardEntity } from './entities/dashboard.entity';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/utils/pagination.util';
import { Prisma } from '@prisma/client';

/**
 * Every route here requires a valid JWT (enforced by the global JwtAuthGuard)
 * plus the ADMIN role (enforced by the controller-level @Roles).
 */
@ApiTags('Admin')
@ApiBearerAuth('access-token')
@Roles(UserRole.ADMIN)
@ApiUnauthorizedResponse({ description: 'Authentication required', type: ApiErrorResponse })
@ApiForbiddenResponse({ description: 'ADMIN role required', type: ApiErrorResponse })
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly properties: PropertiesService,
    private readonly agents: AgentsService,
    private readonly appointments: AppointmentsService,
    private readonly reports: ReportsService,
    private readonly prisma: PrismaService,
  ) {}

  // -------------------------------------------------------------------------
  //  Dashboard
  // -------------------------------------------------------------------------

  @Get('dashboard')
  @ApiMessage('Dashboard retrieved successfully')
  @ApiOperation({
    summary: 'Platform dashboard',
    description:
      'Aggregated counts across users, listings, engagement and the moderation queue, ' +
      'plus the highest-rated agents. Figures are computed live at request time.',
  })
  @ApiOkResponse({ description: 'Dashboard statistics', type: AdminDashboardEntity })
  dashboard() {
    return this.adminService.dashboard();
  }

  // -------------------------------------------------------------------------
  //  Users & agents
  // -------------------------------------------------------------------------

  @Get('users')
  @ApiMessage('Users retrieved successfully')
  @ApiOperation({
    summary: 'List all users',
    description:
      'Search by name or email and filter by role, active state or verification state. ' +
      'Set `includeDeleted=true` to include soft-deleted accounts. ' +
      'Password hashes and token material are never returned.',
  })
  @ApiPaginatedResponse(UserProfileEntity, 'Paginated list of users')
  @ApiBadRequestResponse({ description: 'Invalid query parameters', type: ApiErrorResponse })
  findUsers(@Query() query: AdminQueryUsersDto) {
    return this.adminService.findUsers(query);
  }

  @Patch('users/:id/status')
  @ApiMessage('User status updated successfully')
  @ApiOperation({
    summary: 'Suspend or reactivate a user',
    description:
      'Suspending an account revokes its refresh token, ending every active session. ' +
      'You cannot change your own status, and administrator accounts cannot be suspended here.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'User ID' })
  @ApiBody({ type: SetUserActiveDto })
  @ApiOkResponse({ description: 'User updated', type: UserProfileEntity })
  @ApiBadRequestResponse({
    description: 'Attempted to change your own status or an admin account',
    type: ApiErrorResponse,
  })
  @ApiNotFoundResponse({ description: 'User not found', type: ApiErrorResponse })
  setUserActive(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: SetUserActiveDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.setUserActive(id, dto.isActive, admin);
  }

  @Delete('users/:id')
  @ApiMessage('User deleted successfully')
  @ApiOperation({
    summary: 'Delete a user',
    description:
      'Soft-deletes the account: the row is kept for referential integrity but the ' +
      'email is tombstoned so the address can be reused, and any active session is revoked. ' +
      'You cannot delete your own account, and administrator accounts cannot be deleted here.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'User ID' })
  @ApiOkResponse({ description: 'User deleted', type: MessageOnlyEntity })
  @ApiBadRequestResponse({
    description: 'Attempted to delete your own account or an admin account',
    type: ApiErrorResponse,
  })
  @ApiNotFoundResponse({ description: 'User not found', type: ApiErrorResponse })
  deleteUser(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.deleteUser(id, admin);
  }

  @Get('agents')
  @ApiMessage('Agents retrieved successfully')
  @ApiOperation({
    summary: 'List all agents',
    description: 'Same filters as the public agent directory, without the active-account filter.',
  })
  @ApiPaginatedResponse(AgentEntity, 'Paginated list of agents')
  findAgents(@Query() query: QueryAgentDto) {
    return this.agents.findAll(query);
  }

  @Patch('agents/:id/verify')
  @ApiMessage('Agent verification updated successfully')
  @ApiOperation({
    summary: 'Verify or unverify an agent',
    description: 'Verified agents receive a badge in the public directory.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Agent ID' })
  @ApiBody({ type: VerifyAgentDto })
  @ApiOkResponse({ description: 'Verification updated', type: MessageOnlyEntity })
  @ApiNotFoundResponse({ description: 'Agent not found', type: ApiErrorResponse })
  verifyAgent(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: VerifyAgentDto,
  ) {
    return this.adminService.setAgentVerified(id, dto.isVerified);
  }

  // -------------------------------------------------------------------------
  //  Properties & moderation
  // -------------------------------------------------------------------------

  @Get('properties')
  @ApiMessage('Properties retrieved successfully')
  @ApiOperation({
    summary: 'List all properties',
    description:
      'Unlike the public endpoint this returns listings at every status, including ' +
      'drafts and pending submissions. Filter by `status=PENDING` for the moderation queue.',
  })
  @ApiPaginatedResponse(PropertyEntity, 'Paginated list of properties')
  findProperties(@Query() query: QueryPropertyDto, @CurrentUser() admin: AuthenticatedUser) {
    return this.properties.findAll(query, admin);
  }

  @Patch('properties/:id/approve')
  @ApiMessage('Property approved successfully')
  @ApiOperation({
    summary: 'Approve a property listing',
    description:
      'Publishes the listing to the marketplace, clears any previous rejection reason, ' +
      "refreshes the agent's listing count and sends a PROPERTY_APPROVED notification.",
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Property ID' })
  @ApiOkResponse({ description: 'Property approved', type: PropertyEntity })
  @ApiBadRequestResponse({ description: 'Property is already approved', type: ApiErrorResponse })
  @ApiNotFoundResponse({ description: 'Property not found', type: ApiErrorResponse })
  approveProperty(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.approveProperty(id, admin);
  }

  @Patch('properties/:id/reject')
  @ApiMessage('Property rejected successfully')
  @ApiOperation({
    summary: 'Reject a property listing',
    description:
      'Unpublishes the listing and records a reason, which is delivered to the agent in a ' +
      'PROPERTY_REJECTED notification so they know what to correct.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Property ID' })
  @ApiBody({ type: RejectPropertyDto })
  @ApiOkResponse({ description: 'Property rejected', type: PropertyEntity })
  @ApiBadRequestResponse({
    description: 'Missing reason or property already rejected',
    type: ApiErrorResponse,
  })
  @ApiNotFoundResponse({ description: 'Property not found', type: ApiErrorResponse })
  rejectProperty(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: RejectPropertyDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.rejectProperty(id, dto.reason, admin);
  }

  @Patch('properties/:id/feature')
  @ApiMessage('Property feature flag updated successfully')
  @ApiOperation({
    summary: 'Feature or unfeature a property',
    description:
      'Featuring is an editorial decision reserved for admins, which is why it is not part ' +
      'of the agent-facing property update. Only approved listings can be featured.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Property ID' })
  @ApiBody({ type: FeaturePropertyDto })
  @ApiOkResponse({ description: 'Feature flag updated', type: PropertyEntity })
  @ApiBadRequestResponse({ description: 'Listing is not approved', type: ApiErrorResponse })
  @ApiNotFoundResponse({ description: 'Property not found', type: ApiErrorResponse })
  featureProperty(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: FeaturePropertyDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.setPropertyFeatured(id, dto.isFeatured, admin);
  }

  // -------------------------------------------------------------------------
  //  Appointments & reviews
  // -------------------------------------------------------------------------

  @Get('appointments')
  @ApiMessage('Appointments retrieved successfully')
  @ApiOperation({
    summary: 'List all appointments',
    description: 'Platform-wide view across every agent and user, with the usual filters.',
  })
  @ApiPaginatedResponse(AppointmentEntity, 'Paginated list of appointments')
  findAppointments(@Query() query: QueryAppointmentDto, @CurrentUser() admin: AuthenticatedUser) {
    return this.appointments.findAll(query, admin);
  }

  @Get('reviews')
  @ApiMessage('Reviews retrieved successfully')
  @ApiOperation({
    summary: 'List all reviews',
    description:
      'Platform-wide review list for moderation. Use `DELETE /reviews/:id` as an admin to ' +
      'remove a review that breaches policy.',
  })
  @ApiPaginatedResponse(ReviewEntity, 'Paginated list of reviews')
  async findReviews(@Query() query: QueryReviewDto) {
    const where: Prisma.ReviewWhereInput = {
      deletedAt: null,
      ...(query.rating !== undefined ? { rating: query.rating } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: query.skip,
        take: query.limit,
        include: {
          author: { select: { id: true, name: true, avatar: true } },
          agent: { select: { id: true, user: { select: { name: true } } } },
        },
      }),
      this.prisma.review.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  // -------------------------------------------------------------------------
  //  Reports
  // -------------------------------------------------------------------------

  @Get('reports')
  @ApiMessage('Reports retrieved successfully')
  @ApiOperation({
    summary: 'The moderation queue',
    description:
      'Lists every abuse report. Filter by status, target type, target or reporter. ' +
      'Each entry includes a resolved label for the reported entity so the queue is ' +
      'readable without extra lookups.',
  })
  @ApiPaginatedResponse(ReportEntity, 'Paginated list of reports')
  @ApiBadRequestResponse({ description: 'Invalid query parameters', type: ApiErrorResponse })
  findReports(@Query() query: QueryReportDto) {
    return this.reports.findAll(query);
  }

  @Get('reports/:id')
  @ApiMessage('Report retrieved successfully')
  @ApiOperation({ summary: 'Get a single report', description: 'ADMIN only.' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Report ID' })
  @ApiOkResponse({ description: 'Report found', type: ReportEntity })
  @ApiNotFoundResponse({ description: 'Report not found', type: ApiErrorResponse })
  findReport(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.reports.findOne(id);
  }

  @Patch('reports/:id')
  @ApiMessage('Report updated successfully')
  @ApiOperation({
    summary: 'Action a report',
    description:
      'Moves a report through PENDING, REVIEWING, RESOLVED or REJECTED. ' +
      'Closing a report records which administrator actioned it and when.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Report ID' })
  @ApiBody({ type: UpdateReportDto })
  @ApiOkResponse({ description: 'Report updated', type: ReportEntity })
  @ApiBadRequestResponse({
    description: 'Report is already in the requested status',
    type: ApiErrorResponse,
  })
  @ApiNotFoundResponse({ description: 'Report not found', type: ApiErrorResponse })
  updateReport(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateReportDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.reports.update(id, dto, admin);
  }
}
