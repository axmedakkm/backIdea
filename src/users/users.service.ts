import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService, USER_PUBLIC_SELECT } from '../auth/auth.service';
import { UserProfileEntity } from '../auth/entities/auth-response.entity';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeEmailDto } from './dto/change-email.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async findMe(userId: string): Promise<UserProfileEntity> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: USER_PUBLIC_SELECT,
    });

    if (!user) {
      throw new NotFoundException('User account not found');
    }

    return this.authService.toProfile(user);
  }

  async updateMe(userId: string, dto: UpdateUserDto): Promise<UserProfileEntity> {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('Provide at least one field to update');
    }

    await this.assertExists(userId);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.avatar !== undefined ? { avatar: dto.avatar } : {}),
      },
      select: USER_PUBLIC_SELECT,
    });

    return this.authService.toProfile(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, password: true },
    });

    if (!user) {
      throw new NotFoundException('User account not found');
    }

    const matches = await bcrypt.compare(dto.currentPassword, user.password);
    if (!matches) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('The new password must differ from the current one');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: await this.authService.hashPassword(dto.newPassword),
        // Force other devices to sign in again with the new credentials.
        hashedRefreshToken: null,
      },
    });

    this.logger.log(`Password changed for user ${userId}`);

    return { message: 'Password changed successfully. Please sign in again.' };
  }

  async changeEmail(userId: string, dto: ChangeEmailDto): Promise<UserProfileEntity> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true, password: true },
    });

    if (!user) {
      throw new NotFoundException('User account not found');
    }

    const matches = await bcrypt.compare(dto.password, user.password);
    if (!matches) {
      throw new UnauthorizedException('Password is incorrect');
    }

    if (user.email === dto.email) {
      throw new BadRequestException('The new email address matches the current one');
    }

    const taken = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    if (taken) {
      throw new ConflictException('An account with this email address already exists');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        email: dto.email,
        // A changed address is unverified until confirmed again.
        isEmailVerified: false,
      },
      select: USER_PUBLIC_SELECT,
    });

    return this.authService.toProfile(updated);
  }

  /**
   * Soft-deletes the account. The row is retained so that historical
   * properties, messages and appointments keep a valid foreign key,
   * but the email is released for reuse.
   */
  async deleteMe(userId: string): Promise<{ message: string }> {
    await this.assertExists(userId);

    const timestamp = Date.now();

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        isActive: false,
        hashedRefreshToken: null,
        // Tombstone the email so the address can be registered again.
        email: `deleted+${timestamp}.${userId}@deleted.local`,
        passwordResetToken: null,
        emailVerificationToken: null,
      },
    });

    this.logger.log(`Soft-deleted user account ${userId}`);

    return { message: 'Your account has been deleted' };
  }

  private async assertExists(userId: string): Promise<void> {
    const exists = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException('User account not found');
    }
  }
}
