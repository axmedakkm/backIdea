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
import { ApiPaginatedResponse } from '../common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrorResponse } from '../common/dto/api-response.dto';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { QueryAppointmentDto } from './dto/query-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { AppointmentEntity } from './entities/appointment.entity';

@ApiTags('Appointments')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Authentication required', type: ApiErrorResponse })
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiMessage('Appointment created successfully')
  @ApiOperation({
    summary: 'Request a property viewing',
    description:
      'Any signed-in user can request a viewing of a publicly available listing. ' +
      'You cannot book a viewing of your own listing, and you may hold only one open ' +
      'request per property at a time. The listing agent receives a NEW_APPOINTMENT notification.',
  })
  @ApiBody({ type: CreateAppointmentDto })
  @ApiCreatedResponse({ description: 'Appointment created', type: AppointmentEntity })
  @ApiBadRequestResponse({
    description: 'Validation failed, date in the past, own listing, or duplicate request',
    type: ApiErrorResponse,
  })
  @ApiNotFoundResponse({ description: 'Property not found or unavailable', type: ApiErrorResponse })
  create(@Body() dto: CreateAppointmentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.appointmentsService.create(dto, actor);
  }

  @Get()
  @ApiMessage('Appointments retrieved successfully')
  @ApiOperation({
    summary: 'List your appointments',
    description:
      'Returns only appointments you are party to. Use `role=requester` for viewings you ' +
      'booked, `role=agent` for viewings on your own listings, or the default `role=all` ' +
      'for both. Admins see every appointment. Filter by status, property or date range.',
  })
  @ApiPaginatedResponse(AppointmentEntity, 'Paginated list of appointments')
  @ApiBadRequestResponse({ description: 'Invalid query parameters', type: ApiErrorResponse })
  findAll(@Query() query: QueryAppointmentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.appointmentsService.findAll(query, actor);
  }

  @Get(':id')
  @ApiMessage('Appointment retrieved successfully')
  @ApiOperation({
    summary: 'Get a single appointment',
    description:
      'Accessible to the person who booked it, the listing agent, and admins. ' +
      'Anyone else receives 404 rather than 403, so appointment IDs cannot be probed.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Appointment ID' })
  @ApiOkResponse({ description: 'Appointment found', type: AppointmentEntity })
  @ApiBadRequestResponse({ description: 'Malformed UUID', type: ApiErrorResponse })
  @ApiNotFoundResponse({ description: 'Appointment not found', type: ApiErrorResponse })
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.appointmentsService.findOne(id, actor);
  }

  @Patch(':id')
  @ApiMessage('Appointment updated successfully')
  @ApiOperation({
    summary: 'Update or respond to an appointment',
    description:
      'The listing agent (and admins) may CONFIRM, CANCEL or mark an appointment COMPLETED. ' +
      'The person who booked it may only CANCEL, and is the only one who can edit the note. ' +
      'Rescheduling a confirmed viewing returns it to PENDING. ' +
      'Cancelled and completed appointments are final.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Appointment ID' })
  @ApiBody({ type: UpdateAppointmentDto })
  @ApiOkResponse({ description: 'Appointment updated', type: AppointmentEntity })
  @ApiBadRequestResponse({
    description: 'Validation failed, empty body, past date, or appointment already final',
    type: ApiErrorResponse,
  })
  @ApiForbiddenResponse({
    description: 'Status transition or note edit not permitted for your role',
    type: ApiErrorResponse,
  })
  @ApiNotFoundResponse({ description: 'Appointment not found', type: ApiErrorResponse })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateAppointmentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.appointmentsService.update(id, dto, actor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Appointment cancelled successfully')
  @ApiOperation({
    summary: 'Cancel an appointment',
    description:
      'Available to the person who booked it, the listing agent, and admins. ' +
      'The appointment is cancelled and soft-deleted, and the other party is notified.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Appointment ID' })
  @ApiOkResponse({ description: 'Appointment cancelled', type: MessageOnlyEntity })
  @ApiNotFoundResponse({ description: 'Appointment not found', type: ApiErrorResponse })
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.appointmentsService.remove(id, actor);
  }
}
