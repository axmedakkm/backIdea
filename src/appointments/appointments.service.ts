import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, Prisma, PropertyStatus, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { PaginatedResult, paginate } from '../common/utils/pagination.util';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { AppointmentRole, QueryAppointmentDto } from './dto/query-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { AppointmentEntity } from './entities/appointment.entity';

const APPOINTMENT_INCLUDE = {
  property: {
    select: {
      id: true,
      title: true,
      slug: true,
      address: true,
      city: true,
      agentId: true,
      agent: { select: { id: true, userId: true, user: { select: { name: true } } } },
      images: {
        where: { isPrimary: true },
        select: { url: true },
        take: 1,
      },
    },
  },
  user: { select: { id: true, name: true, email: true, phone: true, avatar: true } },
} satisfies Prisma.AppointmentInclude;

type AppointmentWithRelations = Prisma.AppointmentGetPayload<{
  include: typeof APPOINTMENT_INCLUDE;
}>;

/** Terminal states cannot be transitioned out of. */
const TERMINAL_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.CANCELLED,
  AppointmentStatus.COMPLETED,
];

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: CreateAppointmentDto, actor: AuthenticatedUser): Promise<AppointmentEntity> {
    const scheduledAt = new Date(dto.scheduledAt);

    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException('scheduledAt must be a future date and time');
    }

    const property = await this.prisma.property.findFirst({
      where: { id: dto.propertyId, deletedAt: null },
      select: {
        id: true,
        title: true,
        isApproved: true,
        isPublished: true,
        status: true,
        agent: { select: { id: true, userId: true } },
      },
    });

    const isVisible =
      property?.isApproved && property.isPublished && property.status === PropertyStatus.APPROVED;

    if (!property || !isVisible) {
      throw new NotFoundException(`Property with ID "${dto.propertyId}" was not found`);
    }

    if (property.agent.userId === actor.id) {
      throw new BadRequestException('You cannot book a viewing of your own listing');
    }

    // Prevent accidental double-booking of the same listing by the same user.
    const duplicate = await this.prisma.appointment.findFirst({
      where: {
        propertyId: dto.propertyId,
        userId: actor.id,
        deletedAt: null,
        status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new BadRequestException(
        'You already have an open viewing request for this property. Update it instead.',
      );
    }

    const appointment = await this.prisma.appointment.create({
      data: {
        propertyId: dto.propertyId,
        userId: actor.id,
        scheduledAt,
        durationMin: dto.durationMin ?? 60,
        note: dto.note,
      },
      include: APPOINTMENT_INCLUDE,
    });

    await this.notifications.createAndPush({
      userId: property.agent.userId,
      type: 'NEW_APPOINTMENT',
      title: 'New viewing request',
      body: `${appointment.user.name} requested a viewing of ${property.title}.`,
      data: { appointmentId: appointment.id, propertyId: property.id },
    });

    return this.toEntity(appointment);
  }

  async findAll(
    query: QueryAppointmentDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedResult<AppointmentEntity>> {
    const where: Prisma.AppointmentWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.propertyId ? { propertyId: query.propertyId } : {}),
      ...(query.from || query.to
        ? {
            scheduledAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...this.scopeToActor(query.role, actor),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.appointment.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: query.skip,
        take: query.limit,
        include: APPOINTMENT_INCLUDE,
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return paginate(
      items.map((item) => this.toEntity(item)),
      total,
      query.page,
      query.limit,
    );
  }

  async findOne(id: string, actor: AuthenticatedUser): Promise<AppointmentEntity> {
    const appointment = await this.loadOrThrow(id);

    if (!this.canAccess(appointment, actor)) {
      throw new NotFoundException(`Appointment with ID "${id}" was not found`);
    }

    return this.toEntity(appointment);
  }

  async update(
    id: string,
    dto: UpdateAppointmentDto,
    actor: AuthenticatedUser,
  ): Promise<AppointmentEntity> {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('Provide at least one field to update');
    }

    const appointment = await this.loadOrThrow(id);

    if (!this.canAccess(appointment, actor)) {
      throw new NotFoundException(`Appointment with ID "${id}" was not found`);
    }

    const isAgent = this.isListingAgent(appointment, actor);
    const isRequester = appointment.userId === actor.id;
    const isAdmin = actor.role === UserRole.ADMIN;

    if (TERMINAL_STATUSES.includes(appointment.status) && !isAdmin) {
      throw new BadRequestException(
        `This appointment is already ${appointment.status.toLowerCase()} and can no longer be changed`,
      );
    }

    if (dto.status) {
      this.assertStatusTransitionAllowed(dto.status, { isAgent, isRequester, isAdmin });
    }

    if (dto.scheduledAt) {
      const scheduledAt = new Date(dto.scheduledAt);

      if (scheduledAt.getTime() <= Date.now()) {
        throw new BadRequestException('scheduledAt must be a future date and time');
      }
    }

    // Only the requester wrote the original note, so only they may edit it.
    if (dto.note !== undefined && !isRequester && !isAdmin) {
      throw new ForbiddenException('Only the person who booked the viewing can change the note');
    }

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: {
        ...(dto.scheduledAt ? { scheduledAt: new Date(dto.scheduledAt) } : {}),
        ...(dto.durationMin !== undefined ? { durationMin: dto.durationMin } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.status === AppointmentStatus.CANCELLED
          ? { cancelReason: dto.cancelReason ?? null }
          : {}),
        // Rescheduling a confirmed viewing sends it back for confirmation.
        ...(dto.scheduledAt && !dto.status && appointment.status === AppointmentStatus.CONFIRMED
          ? { status: AppointmentStatus.PENDING }
          : {}),
      },
      include: APPOINTMENT_INCLUDE,
    });

    await this.notifyStatusChange(appointment, updated, actor);

    return this.toEntity(updated);
  }

  /**
   * Cancels rather than hard-deletes, then soft-deletes the row so it
   * disappears from listings while remaining auditable.
   */
  async remove(id: string, actor: AuthenticatedUser): Promise<{ message: string }> {
    const appointment = await this.loadOrThrow(id);

    if (!this.canAccess(appointment, actor)) {
      throw new NotFoundException(`Appointment with ID "${id}" was not found`);
    }

    await this.prisma.appointment.update({
      where: { id },
      data: {
        status: AppointmentStatus.CANCELLED,
        deletedAt: new Date(),
      },
    });

    const counterpartId =
      appointment.userId === actor.id
        ? appointment.property.agent.userId
        : appointment.userId;

    await this.notifications.createAndPush({
      userId: counterpartId,
      type: 'APPOINTMENT_CANCELLED',
      title: 'Viewing cancelled',
      body: `The viewing of ${appointment.property.title} was cancelled.`,
      data: { appointmentId: appointment.id, propertyId: appointment.propertyId },
    });

    return { message: 'Appointment cancelled successfully' };
  }

  // -------------------------------------------------------------------------
  //  Authorization
  // -------------------------------------------------------------------------

  /**
   * An appointment is visible to the person who booked it, the agent whose
   * listing it is, and admins. Nobody else.
   */
  private canAccess(appointment: AppointmentWithRelations, actor: AuthenticatedUser): boolean {
    return (
      actor.role === UserRole.ADMIN ||
      appointment.userId === actor.id ||
      this.isListingAgent(appointment, actor)
    );
  }

  private isListingAgent(
    appointment: AppointmentWithRelations,
    actor: AuthenticatedUser,
  ): boolean {
    return appointment.property.agent.userId === actor.id;
  }

  private assertStatusTransitionAllowed(
    target: AppointmentStatus,
    who: { isAgent: boolean; isRequester: boolean; isAdmin: boolean },
  ): void {
    if (who.isAdmin || who.isAgent) {
      return;
    }

    // The person who booked can withdraw, but cannot confirm their own viewing.
    if (who.isRequester && target !== AppointmentStatus.CANCELLED) {
      throw new ForbiddenException(
        'As the requester you can only cancel this appointment. ' +
          'Confirming or completing it is up to the listing agent.',
      );
    }
  }

  private scopeToActor(
    role: AppointmentRole,
    actor: AuthenticatedUser,
  ): Prisma.AppointmentWhereInput {
    if (actor.role === UserRole.ADMIN) {
      return {};
    }

    const asRequester: Prisma.AppointmentWhereInput = { userId: actor.id };
    const asAgent: Prisma.AppointmentWhereInput | null = actor.agentId
      ? { property: { agentId: actor.agentId } }
      : null;

    if (role === AppointmentRole.REQUESTER) {
      return asRequester;
    }

    if (role === AppointmentRole.AGENT) {
      // A non-agent asking for the agent view legitimately has nothing to show.
      return asAgent ?? { id: { in: [] } };
    }

    return asAgent ? { OR: [asRequester, asAgent] } : asRequester;
  }

  // -------------------------------------------------------------------------
  //  Helpers
  // -------------------------------------------------------------------------

  private async loadOrThrow(id: string): Promise<AppointmentWithRelations> {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, deletedAt: null },
      include: APPOINTMENT_INCLUDE,
    });

    if (!appointment) {
      throw new NotFoundException(`Appointment with ID "${id}" was not found`);
    }

    return appointment;
  }

  private async notifyStatusChange(
    before: AppointmentWithRelations,
    after: AppointmentWithRelations,
    actor: AuthenticatedUser,
  ): Promise<void> {
    if (before.status === after.status) {
      return;
    }

    const typeByStatus: Partial<Record<AppointmentStatus, 'APPOINTMENT_CONFIRMED' | 'APPOINTMENT_CANCELLED'>> =
      {
        [AppointmentStatus.CONFIRMED]: 'APPOINTMENT_CONFIRMED',
        [AppointmentStatus.CANCELLED]: 'APPOINTMENT_CANCELLED',
      };

    const type = typeByStatus[after.status];

    if (!type) {
      return;
    }

    // Notify the other party, never the person who made the change.
    const recipientId =
      actor.id === after.userId ? after.property.agent.userId : after.userId;

    await this.notifications.createAndPush({
      userId: recipientId,
      type,
      title:
        after.status === AppointmentStatus.CONFIRMED ? 'Viewing confirmed' : 'Viewing cancelled',
      body:
        after.status === AppointmentStatus.CONFIRMED
          ? `Your viewing of ${after.property.title} has been confirmed.`
          : `The viewing of ${after.property.title} was cancelled.`,
      data: { appointmentId: after.id, propertyId: after.propertyId },
    });
  }

  private toEntity(appointment: AppointmentWithRelations): AppointmentEntity {
    const { property, user, ...rest } = appointment;

    return {
      ...rest,
      property: {
        id: property.id,
        title: property.title,
        slug: property.slug,
        address: property.address,
        city: property.city,
        coverImage: property.images[0]?.url ?? null,
        agentId: property.agentId,
        agentName: property.agent.user.name,
      },
      user,
    };
  }
}
