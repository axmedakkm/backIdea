import { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { STRONG_PASSWORD, createTestApp, uniqueEmail } from './setup-app';

describe('Authentication (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: ReturnType<INestApplication['getHttpServer']>;

  const createdEmails: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    server = app.getHttpServer();
  });

  afterAll(async () => {
    if (createdEmails.length) {
      await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    }
    await app.close();
  });

  const register = (overrides: Record<string, unknown> = {}) => {
    const email = (overrides.email as string) ?? uniqueEmail('auth');
    createdEmails.push(email);

    return request(server)
      .post('/api/v1/auth/register')
      .send({ email, password: STRONG_PASSWORD, name: 'Test Person', ...overrides });
  };

  describe('POST /auth/register', () => {
    it('creates an account and returns a session', async () => {
      const res = await register().expect(201);

      expect(res.body).toMatchObject({
        success: true,
        message: 'Account created successfully',
      });
      expect(res.body.data.accessToken).toEqual(expect.any(String));
      expect(res.body.data.refreshToken).toEqual(expect.any(String));
      expect(res.body.data.user.role).toBe(UserRole.USER);
    });

    it('never returns the password hash', async () => {
      const res = await register().expect(201);

      expect(JSON.stringify(res.body)).not.toContain('$2b$');
      expect(res.body.data.user).not.toHaveProperty('password');
    });

    it('rejects a duplicate email with 409', async () => {
      const email = uniqueEmail('dup');

      await register({ email }).expect(201);
      await register({ email }).expect(409);
    });

    it('rejects a weak password with 400 and field details', async () => {
      const res = await register({ password: 'weak' }).expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Validation failed');
      expect(res.body.details.join(' ')).toMatch(/password/i);
    });

    it('rejects an invalid email with 400', async () => {
      await register({ email: 'not-an-email' }).expect(400);
    });

    it('rejects unknown fields', async () => {
      await register({ isAdmin: true }).expect(400);
    });

    it('refuses to create an ADMIN account', async () => {
      await register({ role: UserRole.ADMIN }).expect(400);
    });

    it('creates an agent profile when registering as AGENT', async () => {
      const res = await register({ role: UserRole.AGENT }).expect(201);

      expect(res.body.data.user.role).toBe(UserRole.AGENT);
      expect(res.body.data.user.agentId).toEqual(expect.any(String));
    });
  });

  describe('POST /auth/login', () => {
    it('signs in with correct credentials', async () => {
      const email = uniqueEmail('login');
      await register({ email }).expect(201);

      const res = await request(server)
        .post('/api/v1/auth/login')
        .send({ email, password: STRONG_PASSWORD })
        .expect(200);

      expect(res.body.data.accessToken).toEqual(expect.any(String));
      expect(res.body.data.tokenType).toBe('Bearer');
    });

    it('never returns the password hash', async () => {
      const email = uniqueEmail('login-leak');
      await register({ email }).expect(201);

      const res = await request(server)
        .post('/api/v1/auth/login')
        .send({ email, password: STRONG_PASSWORD })
        .expect(200);

      expect(JSON.stringify(res.body)).not.toContain('$2b$');
      expect(res.body.data.user).not.toHaveProperty('password');
    });

    it('rejects a wrong password with 401', async () => {
      const email = uniqueEmail('badpass');
      await register({ email }).expect(201);

      await request(server)
        .post('/api/v1/auth/login')
        .send({ email, password: 'Wr0ng!Password' })
        .expect(401);
    });

    it('gives the same response for an unknown email as a wrong password', async () => {
      const res = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: uniqueEmail('ghost'), password: STRONG_PASSWORD })
        .expect(401);

      expect(res.body.message).toBe('Invalid email or password');
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates the token pair', async () => {
      const email = uniqueEmail('rotate');
      const registered = await register({ email }).expect(201);
      const original = registered.body.data.refreshToken;

      const res = await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: original })
        .expect(200);

      expect(res.body.data.refreshToken).not.toBe(original);
      expect(res.body.data.accessToken).toEqual(expect.any(String));
    });

    it('detects replay of an already-rotated token and ends the session', async () => {
      const email = uniqueEmail('replay');
      const registered = await register({ email }).expect(201);
      const original = registered.body.data.refreshToken;

      const rotated = await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: original })
        .expect(200);

      // Reusing the old token must fail...
      await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: original })
        .expect(401);

      // ...and must also invalidate the token that replaced it.
      await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: rotated.body.data.refreshToken })
        .expect(401);
    });

    it('rejects a malformed token with 400', async () => {
      await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'not-a-jwt' })
        .expect(400);
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the refresh token', async () => {
      const email = uniqueEmail('logout');
      const registered = await register({ email }).expect(201);
      const { accessToken, refreshToken } = registered.body.data;

      await request(server)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });

    it('requires authentication', async () => {
      await request(server).post('/api/v1/auth/logout').expect(401);
    });
  });

  describe('password recovery', () => {
    it('completes the forgot / reset cycle and invalidates the old password', async () => {
      const email = uniqueEmail('reset');
      await register({ email }).expect(201);

      const forgot = await request(server)
        .post('/api/v1/auth/forgot-password')
        .send({ email })
        .expect(200);

      const token = forgot.body.data.token;
      expect(token).toEqual(expect.any(String));

      const newPassword = 'Reset!Passw0rd';

      await request(server)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: newPassword })
        .expect(200);

      await request(server)
        .post('/api/v1/auth/login')
        .send({ email, password: newPassword })
        .expect(200);

      await request(server)
        .post('/api/v1/auth/login')
        .send({ email, password: STRONG_PASSWORD })
        .expect(401);
    });

    it('does not reveal whether an email is registered', async () => {
      const res = await request(server)
        .post('/api/v1/auth/forgot-password')
        .send({ email: uniqueEmail('unknown') })
        .expect(200);

      expect(res.body.data.message).toMatch(/If an account exists/);
      expect(res.body.data.token).toBeUndefined();
    });

    it('rejects a reset token that has already been used', async () => {
      const email = uniqueEmail('reuse');
      await register({ email }).expect(201);

      const forgot = await request(server)
        .post('/api/v1/auth/forgot-password')
        .send({ email })
        .expect(200);

      const token = forgot.body.data.token;

      await request(server)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'Reset!Passw0rd' })
        .expect(200);

      await request(server)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'Another!Passw0rd' })
        .expect(400);
    });
  });

  describe('POST /auth/verify-email', () => {
    it('verifies an address with the registration token', async () => {
      const registered = await register().expect(201);
      const token = registered.body.data.verificationToken;

      expect(token).toEqual(expect.any(String));

      await request(server).post('/api/v1/auth/verify-email').send({ token }).expect(200);

      const me = await request(server)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${registered.body.data.accessToken}`)
        .expect(200);

      expect(me.body.data.isEmailVerified).toBe(true);
    });

    it('rejects an unknown token', async () => {
      await request(server)
        .post('/api/v1/auth/verify-email')
        .send({ token: 'a'.repeat(64) })
        .expect(400);
    });
  });

  describe('JWT protection', () => {
    it('rejects a request with no token', async () => {
      await request(server).get('/api/v1/users/me').expect(401);
    });

    it('rejects a malformed token', async () => {
      await request(server)
        .get('/api/v1/users/me')
        .set('Authorization', 'Bearer garbage.token.value')
        .expect(401);
    });

    it('rejects a refresh token used as an access token', async () => {
      const registered = await register().expect(201);

      await request(server)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${registered.body.data.refreshToken}`)
        .expect(401);
    });
  });
});
