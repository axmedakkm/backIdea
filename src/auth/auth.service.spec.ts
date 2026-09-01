import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

const CONFIG: Record<string, unknown> = {
  'jwt.accessSecret': 'test-access-secret-that-is-long-enough-for-hs256',
  'jwt.refreshSecret': 'test-refresh-secret-that-is-long-enough-for-hs256',
  'jwt.accessExpiresIn': '15m',
  'jwt.refreshExpiresIn': '7d',
  'app.bcryptSaltRounds': 10,
  'app.nodeEnv': 'test',
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  const baseUser = {
    id: '3f2504e0-4f89-4000-8a0c-0305e82c3301',
    email: 'jordan.rivera@example.com',
    name: 'Jordan Rivera',
    phone: null,
    avatar: null,
    role: UserRole.USER,
    isEmailVerified: false,
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    agent: null,
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue(baseUser),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        JwtService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: unknown) => CONFIG[key] ?? fallback,
            getOrThrow: (key: string) => {
              const value = CONFIG[key];
              if (value === undefined) throw new Error(`Missing config ${key}`);
              return value;
            },
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('register', () => {
    it('rejects an email that is already registered', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.register({
          email: baseUser.email,
          password: 'Str0ng!Pass',
          name: 'Jordan Rivera',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('refuses to create an ADMIN account through self-registration', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.register({
          email: 'sneaky@example.com',
          password: 'Str0ng!Pass',
          name: 'Sneaky Person',
          role: UserRole.ADMIN,
        }),
      ).rejects.toThrow(/ADMIN accounts cannot be created/);
    });

    it('stores a bcrypt hash rather than the plaintext password', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(baseUser);

      await service.register({
        email: baseUser.email,
        password: 'Str0ng!Pass',
        name: 'Jordan Rivera',
      });

      const stored = prisma.user.create.mock.calls[0][0].data.password as string;

      expect(stored).not.toBe('Str0ng!Pass');
      expect(stored.startsWith('$2')).toBe(true);
      expect(await bcrypt.compare('Str0ng!Pass', stored)).toBe(true);
    });

    it('provisions an agent profile alongside an AGENT account', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ ...baseUser, role: UserRole.AGENT });

      await service.register({
        email: 'agent@example.com',
        password: 'Str0ng!Pass',
        name: 'New Agent',
        role: UserRole.AGENT,
      });

      expect(prisma.user.create.mock.calls[0][0].data.agent).toEqual({ create: {} });
    });

    it('stores only a hash of the email verification token', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(baseUser);

      const result = await service.register({
        email: baseUser.email,
        password: 'Str0ng!Pass',
        name: 'Jordan Rivera',
      });

      const storedToken = prisma.user.create.mock.calls[0][0].data
        .emailVerificationToken as string;

      expect(result.verificationToken).toBeDefined();
      expect(storedToken).not.toBe(result.verificationToken);
      expect(storedToken).toBe(
        createHash('sha256').update(result.verificationToken as string).digest('hex'),
      );
    });
  });

  describe('login', () => {
    it('rejects an unknown email without revealing that it is unknown', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'Str0ng!Pass' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
    });

    it('rejects an incorrect password with the same message as an unknown email', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...baseUser,
        password: await bcrypt.hash('TheRealPassword1', 10),
      });

      await expect(
        service.login({ email: baseUser.email, password: 'WrongPassword1' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
    });

    it('rejects a deactivated account even with correct credentials', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...baseUser,
        isActive: false,
        password: await bcrypt.hash('Str0ng!Pass', 10),
      });

      await expect(
        service.login({ email: baseUser.email, password: 'Str0ng!Pass' }),
      ).rejects.toThrow(/deactivated/);
    });

    it('issues a token pair and never returns the password', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...baseUser,
        password: await bcrypt.hash('Str0ng!Pass', 10),
      });

      const session = await service.login({
        email: baseUser.email,
        password: 'Str0ng!Pass',
      });

      expect(session.accessToken).toEqual(expect.any(String));
      expect(session.refreshToken).toEqual(expect.any(String));
      expect(session.tokenType).toBe('Bearer');
      expect(session.expiresIn).toBe(900);
      expect(session.user).not.toHaveProperty('password');
    });
  });

  describe('refresh token storage', () => {
    it('stores a SHA-256 digest, not a bcrypt hash', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...baseUser,
        password: await bcrypt.hash('Str0ng!Pass', 10),
      });

      const session = await service.login({
        email: baseUser.email,
        password: 'Str0ng!Pass',
      });

      const stored = prisma.user.update.mock.calls.at(-1)?.[0].data.hashedRefreshToken as string;

      // bcrypt truncates input at 72 bytes, and every JWT for a given user
      // shares an identical first 72 bytes, so bcrypt would make any of that
      // user's tokens compare equal and defeat rotation entirely.
      expect(stored).toBe(createHash('sha256').update(session.refreshToken).digest('hex'));
      expect(stored).toHaveLength(64);
      expect(stored.startsWith('$2')).toBe(false);
    });

    it('issues a distinct refresh token on every login, even within the same second', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...baseUser,
        password: await bcrypt.hash('Str0ng!Pass', 10),
      });

      const first = await service.login({ email: baseUser.email, password: 'Str0ng!Pass' });
      const second = await service.login({ email: baseUser.email, password: 'Str0ng!Pass' });

      // Guaranteed by the `jti` claim; without it identical `iat` values
      // produce byte-identical tokens.
      expect(first.refreshToken).not.toBe(second.refreshToken);
    });
  });

  describe('refresh', () => {
    it('rejects a malformed token', async () => {
      await expect(service.refresh('not-a-jwt')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an access token presented as a refresh token', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...baseUser,
        password: await bcrypt.hash('Str0ng!Pass', 10),
      });

      const session = await service.login({
        email: baseUser.email,
        password: 'Str0ng!Pass',
      });

      // Access and refresh tokens are signed with different secrets, so this
      // fails signature verification before the `type` claim is even read.
      await expect(service.refresh(session.accessToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a token that is correctly signed but has the wrong type claim', async () => {
      const jwt = new JwtService();
      const refreshSecretTokenWithAccessType = await jwt.signAsync(
        { sub: baseUser.id, email: baseUser.email, role: baseUser.role, type: 'access' },
        { secret: CONFIG['jwt.refreshSecret'] as string, expiresIn: '7d' },
      );

      await expect(service.refresh(refreshSecretTokenWithAccessType)).rejects.toThrow(
        /refresh token is required/i,
      );
    });

    it('rejects a valid token when the session has been ended', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...baseUser,
        password: await bcrypt.hash('Str0ng!Pass', 10),
      });

      const session = await service.login({
        email: baseUser.email,
        password: 'Str0ng!Pass',
      });

      // Simulates logout: the stored digest was cleared.
      prisma.user.findFirst.mockResolvedValue({
        id: baseUser.id,
        email: baseUser.email,
        role: baseUser.role,
        isActive: true,
        hashedRefreshToken: null,
      });

      await expect(service.refresh(session.refreshToken)).rejects.toThrow(/sign in again/);
    });

    it('detects replay of a rotated token and ends the session', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...baseUser,
        password: await bcrypt.hash('Str0ng!Pass', 10),
      });

      const session = await service.login({
        email: baseUser.email,
        password: 'Str0ng!Pass',
      });

      // The stored digest belongs to a newer token than the one presented.
      prisma.user.findFirst.mockResolvedValue({
        id: baseUser.id,
        email: baseUser.email,
        role: baseUser.role,
        isActive: true,
        hashedRefreshToken: createHash('sha256').update('a-newer-token').digest('hex'),
      });

      await expect(service.refresh(session.refreshToken)).rejects.toThrow(/already been used/);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { hashedRefreshToken: null } }),
      );
    });
  });

  describe('logout', () => {
    it('clears the stored refresh token digest', async () => {
      await service.logout(baseUser.id);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: baseUser.id },
        data: { hashedRefreshToken: null },
      });
    });
  });

  describe('requestPasswordReset', () => {
    it('returns the same message for an unknown email, to prevent enumeration', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      const result = await service.requestPasswordReset({ email: 'nobody@example.com' });

      expect(result.message).toMatch(/If an account exists/);
      expect(result.token).toBeUndefined();
    });

    it('stores only a hash of the reset token', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: baseUser.id });

      const result = await service.requestPasswordReset({ email: baseUser.email });
      const stored = prisma.user.update.mock.calls.at(-1)?.[0].data.passwordResetToken as string;

      expect(stored).toBe(createHash('sha256').update(result.token as string).digest('hex'));
    });
  });

  describe('resetPassword', () => {
    it('rejects an expired or unknown token', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.resetPassword({ token: 'a'.repeat(64), password: 'N3w!Passw0rd' }),
      ).rejects.toThrow(/invalid or has expired/);
    });

    it('revokes active sessions when the password changes', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: baseUser.id });

      await service.resetPassword({ token: 'a'.repeat(64), password: 'N3w!Passw0rd' });

      const data = prisma.user.update.mock.calls.at(-1)?.[0].data;

      expect(data.hashedRefreshToken).toBeNull();
      expect(data.passwordResetToken).toBeNull();
      expect(await bcrypt.compare('N3w!Passw0rd', data.password as string)).toBe(true);
    });
  });
});
