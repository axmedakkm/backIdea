import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import type { SignOptions } from 'jsonwebtoken';
import { JwtPayload } from '../common/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto, ResetPasswordDto, VerifyEmailDto } from './dto/password.dto';
import { RegisterDto } from './dto/register.dto';
import {
  AuthSessionEntity,
  AuthTokensEntity,
  UserProfileEntity,
} from './entities/auth-response.entity';

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Fields safe to return to clients. */
export const USER_PUBLIC_SELECT = {
  id: true,
  email: true,
  name: true,
  phone: true,
  avatar: true,
  role: true,
  isEmailVerified: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  agent: { select: { id: true } },
} satisfies Prisma.UserSelect;

type UserWithAgent = Prisma.UserGetPayload<{ select: typeof USER_PUBLIC_SELECT }>;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // -------------------------------------------------------------------------
  //  Registration & login
  // -------------------------------------------------------------------------

  async register(dto: RegisterDto): Promise<AuthSessionEntity & { verificationToken?: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('An account with this email address already exists');
    }

    // Self-registration must never be able to mint an administrator.
    if (dto.role === UserRole.ADMIN) {
      throw new BadRequestException('ADMIN accounts cannot be created through registration');
    }

    const role = dto.role ?? UserRole.USER;
    const password = await this.hashPassword(dto.password);
    const { raw: verificationToken, hashed } = this.createToken();

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password,
        name: dto.name,
        phone: dto.phone,
        role,
        emailVerificationToken: hashed,
        emailVerificationExpires: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
        // An AGENT account is useless without its profile, so create both atomically.
        ...(role === UserRole.AGENT ? { agent: { create: {} } } : {}),
      },
      select: USER_PUBLIC_SELECT,
    });

    const tokens = await this.issueTokens(user.id, user.email, user.role);
    await this.persistRefreshToken(user.id, tokens.refreshToken);

    this.logger.log(`Registered ${role} account ${user.id}`);

    return {
      ...tokens,
      user: this.toProfile(user),
      // Exposed in non-production so the verification flow is testable without email delivery.
      ...(this.isProduction() ? {} : { verificationToken }),
    };
  }

  async login(dto: LoginDto): Promise<AuthSessionEntity> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
      select: { ...USER_PUBLIC_SELECT, password: true },
    });

    // Compare against a dummy hash when the user is missing so that response
    // timing does not reveal whether an email is registered.
    const passwordHash = user?.password ?? (await this.dummyHash());
    const passwordMatches = await bcrypt.compare(dto.password, passwordHash);

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('This account has been deactivated');
    }

    const tokens = await this.issueTokens(user.id, user.email, user.role);
    await this.persistRefreshToken(user.id, tokens.refreshToken);

    // The password hash was selected only to verify the credentials above;
    // it must not travel any further towards the response.
    const { password: _password, ...publicUser } = user;

    return { ...tokens, user: this.toProfile(publicUser) };
  }

  // -------------------------------------------------------------------------
  //  Token lifecycle
  // -------------------------------------------------------------------------

  async refresh(refreshToken: string): Promise<AuthTokensEntity> {
    let payload: JwtPayload;

    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or has expired');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('A refresh token is required for this endpoint');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        hashedRefreshToken: true,
      },
    });

    if (!user || !user.hashedRefreshToken) {
      throw new UnauthorizedException('Session has ended. Please sign in again.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('This account has been deactivated');
    }

    if (!this.refreshTokenMatches(refreshToken, user.hashedRefreshToken)) {
      // The presented token is well-formed but not the one on record, which
      // suggests replay of a rotated token. Drop the session entirely.
      await this.prisma.user.update({
        where: { id: user.id },
        data: { hashedRefreshToken: null },
      });
      throw new UnauthorizedException('Refresh token has already been used. Please sign in again.');
    }

    const tokens = await this.issueTokens(user.id, user.email, user.role);
    await this.persistRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async logout(userId: string): Promise<{ message: string }> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { hashedRefreshToken: null },
    });

    return { message: 'Signed out successfully' };
  }

  // -------------------------------------------------------------------------
  //  Email verification & password recovery
  // -------------------------------------------------------------------------

  async requestPasswordReset(dto: ForgotPasswordDto): Promise<{ message: string; token?: string }> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
      select: { id: true },
    });

    // Always answer identically so the endpoint cannot be used to enumerate accounts.
    const genericMessage =
      'If an account exists for that email address, a password reset link has been sent';

    if (!user) {
      return { message: genericMessage };
    }

    const { raw, hashed } = this.createToken();

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: hashed,
        passwordResetExpires: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });

    this.logger.log(`Issued password reset token for user ${user.id}`);

    return {
      message: genericMessage,
      ...(this.isProduction() ? {} : { token: raw }),
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const hashed = this.hashToken(dto.token);

    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: hashed,
        passwordResetExpires: { gt: new Date() },
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException('Password reset token is invalid or has expired');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: await this.hashPassword(dto.password),
        passwordResetToken: null,
        passwordResetExpires: null,
        // Invalidate any active session; the password holder must sign in again.
        hashedRefreshToken: null,
      },
    });

    this.logger.log(`Password reset completed for user ${user.id}`);

    return { message: 'Password updated successfully. Please sign in with your new password.' };
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<{ message: string }> {
    const hashed = this.hashToken(dto.token);

    const user = await this.prisma.user.findFirst({
      where: {
        emailVerificationToken: hashed,
        emailVerificationExpires: { gt: new Date() },
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException('Verification token is invalid or has expired');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    });

    return { message: 'Email address verified successfully' };
  }

  // -------------------------------------------------------------------------
  //  Helpers
  // -------------------------------------------------------------------------

  async hashPassword(plain: string): Promise<string> {
    const rounds = this.config.get<number>('app.bcryptSaltRounds', 12);
    return bcrypt.hash(plain, rounds);
  }

  private async dummyHash(): Promise<string> {
    // Cost-matched placeholder used to equalise login timing for unknown emails.
    return bcrypt.hash('invalid-placeholder', this.config.get<number>('app.bcryptSaltRounds', 12));
  }

  private async issueTokens(
    userId: string,
    email: string,
    role: UserRole,
  ): Promise<AuthTokensEntity> {
    // jsonwebtoken types `expiresIn` as a template-literal duration union,
    // so the configured string is narrowed to that type here.
    type Duration = SignOptions['expiresIn'];
    const accessExpiresIn = this.config.get<string>('jwt.accessExpiresIn', '15m');
    const refreshExpiresIn = this.config.get<string>('jwt.refreshExpiresIn', '7d');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub: userId, email, role, type: 'access' } satisfies JwtPayload,
        {
          secret: this.config.getOrThrow<string>('jwt.accessSecret'),
          expiresIn: accessExpiresIn as Duration,
        },
      ),
      this.jwt.signAsync(
        {
          sub: userId,
          email,
          role,
          type: 'refresh',
          jti: randomUUID(),
        } satisfies JwtPayload,
        {
          secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
          expiresIn: refreshExpiresIn as Duration,
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.durationToSeconds(accessExpiresIn),
    };
  }

  /**
   * Stores the SHA-256 digest of the refresh token.
   *
   * bcrypt is deliberately NOT used here: it truncates its input at 72 bytes,
   * and every JWT issued to a given user shares an identical first 72 bytes
   * (fixed header plus the `sub` claim). Hashing with bcrypt would therefore
   * make any of that user's tokens compare equal, silently defeating rotation
   * and replay detection. A refresh token is already high-entropy random
   * material, so a fast digest is the right primitive.
   */
  private async persistRefreshToken(userId: string, refreshToken: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { hashedRefreshToken: this.hashToken(refreshToken) },
    });
  }

  /** Constant-time comparison of a presented token against the stored digest. */
  private refreshTokenMatches(presented: string, storedDigest: string): boolean {
    const presentedDigest = Buffer.from(this.hashToken(presented), 'hex');
    const stored = Buffer.from(storedDigest, 'hex');

    if (presentedDigest.length !== stored.length) {
      return false;
    }

    return timingSafeEqual(presentedDigest, stored);
  }

  /** Returns a random token plus the SHA-256 digest that gets stored. */
  private createToken(): { raw: string; hashed: string } {
    const raw = randomBytes(32).toString('hex');
    return { raw, hashed: this.hashToken(raw) };
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private isProduction(): boolean {
    return this.config.get<string>('app.nodeEnv') === 'production';
  }

  /** Converts "15m" / "7d" / "3600" into seconds for the `expiresIn` response field. */
  private durationToSeconds(duration: string): number {
    const match = /^(\d+)([smhd])?$/.exec(duration.trim());
    if (!match) {
      return 900;
    }

    const value = parseInt(match[1], 10);
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return value * (multipliers[match[2] ?? 's'] ?? 1);
  }

  /**
   * Projects a user row onto the public profile shape.
   *
   * Fields are listed explicitly rather than spread so that widening a
   * `select` elsewhere can never leak password or token columns into a
   * response by accident.
   */
  toProfile(user: UserWithAgent): UserProfileEntity {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      avatar: user.avatar,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      isActive: user.isActive,
      agentId: user.agent?.id ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
