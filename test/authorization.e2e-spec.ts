import { INestApplication } from '@nestjs/common';
import { PropertyStatus, UserRole } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { STRONG_PASSWORD, createTestApp, uniqueEmail } from './setup-app';

interface Actor {
  email: string;
  userId: string;
  agentId: string | null;
  token: string;
  auth: [string, string];
}

describe('Authorization, ownership and core flows (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: ReturnType<INestApplication['getHttpServer']>;

  let agentA: Actor;
  let agentB: Actor;
  let buyer: Actor;
  let otherBuyer: Actor;
  let admin: Actor;

  const emails: string[] = [];

  /** Registers a fresh account and returns everything needed to act as it. */
  const createActor = async (prefix: string, role?: UserRole): Promise<Actor> => {
    const email = uniqueEmail(prefix);
    emails.push(email);

    const res = await request(server)
      .post('/api/v1/auth/register')
      .send({ email, password: STRONG_PASSWORD, name: `${prefix} person`, ...(role ? { role } : {}) })
      .expect(201);

    const token = res.body.data.accessToken as string;

    return {
      email,
      userId: res.body.data.user.id,
      agentId: res.body.data.user.agentId ?? null,
      token,
      auth: ['Authorization', `Bearer ${token}`],
    };
  };

  /** Promotes an account to ADMIN directly, since the API deliberately cannot. */
  const createAdmin = async (): Promise<Actor> => {
    const actor = await createActor('admin');

    await prisma.user.update({
      where: { id: actor.userId },
      data: { role: UserRole.ADMIN },
    });

    const res = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: actor.email, password: STRONG_PASSWORD })
      .expect(200);

    const token = res.body.data.accessToken as string;
    return { ...actor, token, auth: ['Authorization', `Bearer ${token}`] };
  };

  /** Creates an approved, publicly visible listing owned by the given agent. */
  const createPublishedProperty = async (owner: Actor, title: string): Promise<string> => {
    const res = await request(server)
      .post('/api/v1/properties')
      .set(...owner.auth)
      .send({
        title,
        description: 'A listing created by the end-to-end suite to verify authorization rules.',
        price: 250000,
        purpose: 'SALE',
        propertyType: 'APARTMENT',
        area: 95,
        address: '1 Test Street',
        city: 'Testville',
        country: 'Testland',
        isPublished: true,
      })
      .expect(201);

    const id = res.body.data.id as string;

    await prisma.property.update({
      where: { id },
      data: { status: PropertyStatus.APPROVED, isApproved: true, isPublished: true },
    });

    return id;
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    server = app.getHttpServer();

    agentA = await createActor('agent-a', UserRole.AGENT);
    agentB = await createActor('agent-b', UserRole.AGENT);
    buyer = await createActor('buyer');
    otherBuyer = await createActor('other-buyer');
    admin = await createAdmin();
  });

  afterAll(async () => {
    // Cascades clear the properties, favourites, appointments and reviews.
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  // -------------------------------------------------------------------------

  describe('role-based property creation', () => {
    it('lets an AGENT create a listing', async () => {
      const res = await request(server)
        .post('/api/v1/properties')
        .set(...agentA.auth)
        .send({
          title: 'Agent Created Listing',
          description: 'A valid listing created by an agent for the authorization suite.',
          price: 100000,
          purpose: 'SALE',
          propertyType: 'HOUSE',
          area: 120,
          address: '2 Test Street',
          city: 'Testville',
          country: 'Testland',
        })
        .expect(201);

      expect(res.body.data.agentId).toBe(agentA.agentId);
      // A new listing is a draft and is not publicly visible yet.
      expect(res.body.data.status).toBe(PropertyStatus.DRAFT);
      expect(res.body.data.isApproved).toBe(false);
    });

    it('forbids a plain USER from creating a listing', async () => {
      await request(server)
        .post('/api/v1/properties')
        .set(...buyer.auth)
        .send({
          title: 'User Should Not Create This',
          description: 'This request must be rejected by the roles guard before any work.',
          price: 100000,
          purpose: 'SALE',
          propertyType: 'HOUSE',
          area: 120,
          address: '3 Test Street',
          city: 'Testville',
          country: 'Testland',
        })
        .expect(403);
    });

    it('requires authentication to create a listing', async () => {
      await request(server)
        .post('/api/v1/properties')
        .send({
          title: 'Anonymous Listing Attempt',
          description: 'This request must be rejected because no token was supplied at all.',
          price: 100000,
          purpose: 'SALE',
          propertyType: 'HOUSE',
          area: 120,
          address: '4 Test Street',
          city: 'Testville',
          country: 'Testland',
        })
        .expect(401);
    });

    it('stops an agent creating a listing under another agent profile', async () => {
      await request(server)
        .post('/api/v1/properties')
        .set(...agentA.auth)
        .send({
          title: 'Impersonation Attempt Listing',
          description: 'Agent A trying to publish a listing that belongs to agent B.',
          price: 100000,
          purpose: 'SALE',
          propertyType: 'HOUSE',
          area: 120,
          address: '5 Test Street',
          city: 'Testville',
          country: 'Testland',
          agentId: agentB.agentId,
        })
        .expect(403);
    });
  });

  describe('property ownership', () => {
    let propertyId: string;

    beforeAll(async () => {
      propertyId = await createPublishedProperty(agentA, 'Ownership Fixture Listing');
    });

    it('lets the owning agent update their listing', async () => {
      await request(server)
        .patch(`/api/v1/properties/${propertyId}`)
        .set(...agentA.auth)
        .send({ title: 'Ownership Fixture Listing Renamed' })
        .expect(200);
    });

    it('forbids another agent from updating it', async () => {
      const res = await request(server)
        .patch(`/api/v1/properties/${propertyId}`)
        .set(...agentB.auth)
        .send({ title: 'Hijacked By Agent B' })
        .expect(403);

      expect(res.body.message).toMatch(/your own listings/i);
    });

    it('forbids another agent from deleting it', async () => {
      await request(server)
        .delete(`/api/v1/properties/${propertyId}`)
        .set(...agentB.auth)
        .expect(403);
    });

    it('forbids a plain USER from updating it', async () => {
      await request(server)
        .patch(`/api/v1/properties/${propertyId}`)
        .set(...buyer.auth)
        .send({ title: 'Buyer Should Not Rename This' })
        .expect(403);
    });

    it('stops an agent setting an admin-only status', async () => {
      const res = await request(server)
        .patch(`/api/v1/properties/${propertyId}`)
        .set(...agentA.auth)
        .send({ status: PropertyStatus.APPROVED })
        .expect(403);

      expect(res.body.message).toMatch(/administrator/i);
    });

    it('lets an agent set an owner-permitted status', async () => {
      await request(server)
        .patch(`/api/v1/properties/${propertyId}`)
        .set(...agentA.auth)
        .send({ status: PropertyStatus.SOLD })
        .expect(200);
    });

    it('lets an ADMIN update any listing', async () => {
      await request(server)
        .patch(`/api/v1/properties/${propertyId}`)
        .set(...admin.auth)
        .send({ status: PropertyStatus.APPROVED })
        .expect(200);
    });
  });

  describe('listing visibility', () => {
    let draftId: string;

    beforeAll(async () => {
      const res = await request(server)
        .post('/api/v1/properties')
        .set(...agentA.auth)
        .send({
          title: 'Unpublished Draft Listing',
          description: 'A draft that must stay invisible to the public and to other agents.',
          price: 500000,
          purpose: 'SALE',
          propertyType: 'VILLA',
          area: 300,
          address: '6 Test Street',
          city: 'Testville',
          country: 'Testland',
        })
        .expect(201);

      draftId = res.body.data.id;
    });

    it('hides an unapproved listing from anonymous callers', async () => {
      await request(server).get(`/api/v1/properties/${draftId}`).expect(404);
    });

    it('hides an unapproved listing from other agents', async () => {
      await request(server)
        .get(`/api/v1/properties/${draftId}`)
        .set(...agentB.auth)
        .expect(404);
    });

    it('shows the owning agent their own draft', async () => {
      await request(server)
        .get(`/api/v1/properties/${draftId}`)
        .set(...agentA.auth)
        .expect(200);
    });

    it('shows an admin any listing', async () => {
      await request(server)
        .get(`/api/v1/properties/${draftId}`)
        .set(...admin.auth)
        .expect(200);
    });
  });

  describe('search, filtering, pagination and sorting', () => {
    it('returns the standard pagination envelope', async () => {
      const res = await request(server).get('/api/v1/properties?page=1&limit=5').expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toMatchObject({ page: 1, limit: 5 });
      expect(res.body.meta.totalPages).toEqual(expect.any(Number));
    });

    it('honours a price range filter', async () => {
      const res = await request(server)
        .get('/api/v1/properties?minPrice=200000&maxPrice=400000&limit=50')
        .expect(200);

      for (const property of res.body.data) {
        expect(property.price).toBeGreaterThanOrEqual(200000);
        expect(property.price).toBeLessThanOrEqual(400000);
      }
    });

    it('sorts by price ascending', async () => {
      const res = await request(server)
        .get('/api/v1/properties?sortBy=price&sortOrder=asc&limit=50')
        .expect(200);

      const prices = res.body.data.map((p: { price: number }) => p.price);
      expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    });

    it('filters by purpose and property type', async () => {
      const res = await request(server)
        .get('/api/v1/properties?purpose=SALE&propertyType=APARTMENT&limit=50')
        .expect(200);

      for (const property of res.body.data) {
        expect(property.purpose).toBe('SALE');
        expect(property.propertyType).toBe('APARTMENT');
      }
    });

    it('treats the bedrooms filter as a minimum', async () => {
      const res = await request(server).get('/api/v1/properties?bedrooms=3&limit=50').expect(200);

      for (const property of res.body.data) {
        expect(property.bedrooms).toBeGreaterThanOrEqual(3);
      }
    });

    it('rejects an out-of-range limit', async () => {
      await request(server).get('/api/v1/properties?limit=500').expect(400);
    });

    it('rejects an unknown sort field', async () => {
      await request(server).get('/api/v1/properties?sortBy=password').expect(400);
    });
  });

  describe('property comparison', () => {
    let first: string;
    let second: string;

    beforeAll(async () => {
      first = await createPublishedProperty(agentA, 'Comparison Listing One');
      second = await createPublishedProperty(agentB, 'Comparison Listing Two');
    });

    it('returns both listings with the fields needed for a comparison table', async () => {
      const res = await request(server)
        .get(`/api/v1/properties/compare?ids=${first},${second}`)
        .expect(200);

      expect(res.body.data).toHaveLength(2);

      for (const property of res.body.data) {
        expect(property).toEqual(
          expect.objectContaining({
            price: expect.any(Number),
            area: expect.any(Number),
            propertyType: expect.any(String),
            purpose: expect.any(String),
            city: expect.any(String),
            parkingSpaces: expect.any(Number),
            features: expect.any(Array),
          }),
        );
      }
    });

    it('preserves the requested order', async () => {
      const res = await request(server)
        .get(`/api/v1/properties/compare?ids=${second},${first}`)
        .expect(200);

      expect(res.body.data.map((p: { id: string }) => p.id)).toEqual([second, first]);
    });

    it('rejects a single id', async () => {
      await request(server).get(`/api/v1/properties/compare?ids=${first}`).expect(400);
    });

    it('404s when one of the listings does not exist', async () => {
      await request(server)
        .get(`/api/v1/properties/compare?ids=${first},11111111-1111-4111-8111-111111111111`)
        .expect(404);
    });
  });

  describe('favorites', () => {
    let propertyId: string;

    beforeAll(async () => {
      propertyId = await createPublishedProperty(agentA, 'Favourite Fixture Listing');
    });

    it('requires authentication', async () => {
      await request(server).post(`/api/v1/favorites/${propertyId}`).expect(401);
    });

    it('saves a property', async () => {
      await request(server)
        .post(`/api/v1/favorites/${propertyId}`)
        .set(...buyer.auth)
        .expect(201);
    });

    it('rejects a duplicate with 409, enforced by a unique constraint', async () => {
      await request(server)
        .post(`/api/v1/favorites/${propertyId}`)
        .set(...buyer.auth)
        .expect(409);
    });

    it('lists only the caller own favourites', async () => {
      const mine = await request(server)
        .get('/api/v1/favorites')
        .set(...buyer.auth)
        .expect(200);

      expect(mine.body.data.some((p: { id: string }) => p.id === propertyId)).toBe(true);

      const theirs = await request(server)
        .get('/api/v1/favorites')
        .set(...otherBuyer.auth)
        .expect(200);

      expect(theirs.body.data.some((p: { id: string }) => p.id === propertyId)).toBe(false);
    });

    it('flags isFavorited for the owner of the favourite only', async () => {
      const mine = await request(server)
        .get(`/api/v1/properties/${propertyId}`)
        .set(...buyer.auth)
        .expect(200);

      expect(mine.body.data.isFavorited).toBe(true);

      const theirs = await request(server)
        .get(`/api/v1/properties/${propertyId}`)
        .set(...otherBuyer.auth)
        .expect(200);

      expect(theirs.body.data.isFavorited).toBe(false);
    });

    it('removes a favourite and 404s on a second removal', async () => {
      await request(server)
        .delete(`/api/v1/favorites/${propertyId}`)
        .set(...buyer.auth)
        .expect(200);

      await request(server)
        .delete(`/api/v1/favorites/${propertyId}`)
        .set(...buyer.auth)
        .expect(404);
    });
  });

  describe('appointments', () => {
    let propertyId: string;
    let appointmentId: string;

    const futureDate = (days: number): string => {
      const date = new Date();
      date.setDate(date.getDate() + days);
      return date.toISOString();
    };

    beforeAll(async () => {
      propertyId = await createPublishedProperty(agentA, 'Appointment Fixture Listing');
    });

    it('books a viewing', async () => {
      const res = await request(server)
        .post('/api/v1/appointments')
        .set(...buyer.auth)
        .send({ propertyId, scheduledAt: futureDate(7), note: 'Keen to see the kitchen.' })
        .expect(201);

      expect(res.body.data.status).toBe('PENDING');
      appointmentId = res.body.data.id;
    });

    it('rejects a date in the past', async () => {
      await request(server)
        .post('/api/v1/appointments')
        .set(...otherBuyer.auth)
        .send({ propertyId, scheduledAt: futureDate(-3) })
        .expect(400);
    });

    it('stops an agent booking a viewing of their own listing', async () => {
      await request(server)
        .post('/api/v1/appointments')
        .set(...agentA.auth)
        .send({ propertyId, scheduledAt: futureDate(5) })
        .expect(400);
    });

    it('rejects a second open request for the same property', async () => {
      await request(server)
        .post('/api/v1/appointments')
        .set(...buyer.auth)
        .send({ propertyId, scheduledAt: futureDate(9) })
        .expect(400);
    });

    it('hides the appointment from an uninvolved user', async () => {
      await request(server)
        .get(`/api/v1/appointments/${appointmentId}`)
        .set(...otherBuyer.auth)
        .expect(404);
    });

    it('shows the appointment to the requester and to the listing agent', async () => {
      await request(server)
        .get(`/api/v1/appointments/${appointmentId}`)
        .set(...buyer.auth)
        .expect(200);

      await request(server)
        .get(`/api/v1/appointments/${appointmentId}`)
        .set(...agentA.auth)
        .expect(200);
    });

    it('stops the requester confirming their own viewing', async () => {
      const res = await request(server)
        .patch(`/api/v1/appointments/${appointmentId}`)
        .set(...buyer.auth)
        .send({ status: 'CONFIRMED' })
        .expect(403);

      expect(res.body.message).toMatch(/only cancel/i);
    });

    it('lets the listing agent confirm it', async () => {
      const res = await request(server)
        .patch(`/api/v1/appointments/${appointmentId}`)
        .set(...agentA.auth)
        .send({ status: 'CONFIRMED' })
        .expect(200);

      expect(res.body.data.status).toBe('CONFIRMED');
    });

    it('notifies the requester that the viewing was confirmed', async () => {
      const res = await request(server)
        .get('/api/v1/notifications')
        .set(...buyer.auth)
        .expect(200);

      expect(
        res.body.data.some(
          (n: { type: string }) => n.type === 'APPOINTMENT_CONFIRMED',
        ),
      ).toBe(true);
    });

    it('lets the requester cancel', async () => {
      const res = await request(server)
        .patch(`/api/v1/appointments/${appointmentId}`)
        .set(...buyer.auth)
        .send({ status: 'CANCELLED', cancelReason: 'Plans changed.' })
        .expect(200);

      expect(res.body.data.status).toBe('CANCELLED');
    });

    it('treats a cancelled appointment as final', async () => {
      await request(server)
        .patch(`/api/v1/appointments/${appointmentId}`)
        .set(...agentA.auth)
        .send({ status: 'CONFIRMED' })
        .expect(400);
    });
  });

  describe('reviews', () => {
    let reviewId: string;

    it('rejects a rating above 5', async () => {
      await request(server)
        .post('/api/v1/reviews')
        .set(...buyer.auth)
        .send({ agentId: agentA.agentId, rating: 6 })
        .expect(400);
    });

    it('rejects a rating below 1', async () => {
      await request(server)
        .post('/api/v1/reviews')
        .set(...buyer.auth)
        .send({ agentId: agentA.agentId, rating: 0 })
        .expect(400);
    });

    it('rejects a fractional rating', async () => {
      await request(server)
        .post('/api/v1/reviews')
        .set(...buyer.auth)
        .send({ agentId: agentA.agentId, rating: 4.5 })
        .expect(400);
    });

    it('stops an agent reviewing themselves', async () => {
      await request(server)
        .post('/api/v1/reviews')
        .set(...agentA.auth)
        .send({ agentId: agentA.agentId, rating: 5 })
        .expect(400);
    });

    it('creates a review and updates the agent average', async () => {
      const res = await request(server)
        .post('/api/v1/reviews')
        .set(...buyer.auth)
        .send({ agentId: agentA.agentId, rating: 4, comment: 'Helpful and responsive.' })
        .expect(201);

      reviewId = res.body.data.id;

      const rating = await request(server)
        .get(`/api/v1/agents/${agentA.agentId}/rating`)
        .expect(200);

      expect(rating.body.data.rating).toBe(4);
      expect(rating.body.data.reviewCount).toBe(1);
      expect(rating.body.data.distribution['4']).toBe(1);
    });

    it('rejects a second review of the same agent with 409', async () => {
      await request(server)
        .post('/api/v1/reviews')
        .set(...buyer.auth)
        .send({ agentId: agentA.agentId, rating: 5 })
        .expect(409);
    });

    it('recomputes the average when a second reviewer rates the agent', async () => {
      await request(server)
        .post('/api/v1/reviews')
        .set(...otherBuyer.auth)
        .send({ agentId: agentA.agentId, rating: 2 })
        .expect(201);

      const rating = await request(server)
        .get(`/api/v1/agents/${agentA.agentId}/rating`)
        .expect(200);

      expect(rating.body.data.rating).toBe(3);
      expect(rating.body.data.reviewCount).toBe(2);
    });

    it('forbids editing another user review', async () => {
      await request(server)
        .patch(`/api/v1/reviews/${reviewId}`)
        .set(...otherBuyer.auth)
        .send({ rating: 1 })
        .expect(403);
    });

    it('lets the author edit their own review and recomputes the average', async () => {
      await request(server)
        .patch(`/api/v1/reviews/${reviewId}`)
        .set(...buyer.auth)
        .send({ rating: 5 })
        .expect(200);

      const rating = await request(server)
        .get(`/api/v1/agents/${agentA.agentId}/rating`)
        .expect(200);

      expect(rating.body.data.rating).toBe(3.5);
    });

    it('lets the author delete their review and recomputes the average', async () => {
      await request(server)
        .delete(`/api/v1/reviews/${reviewId}`)
        .set(...buyer.auth)
        .expect(200);

      const rating = await request(server)
        .get(`/api/v1/agents/${agentA.agentId}/rating`)
        .expect(200);

      expect(rating.body.data.rating).toBe(2);
      expect(rating.body.data.reviewCount).toBe(1);
    });
  });

  describe('admin access control', () => {
    const adminRoutes = [
      'dashboard',
      'users',
      'agents',
      'properties',
      'appointments',
      'reviews',
      'reports',
    ];

    it.each(adminRoutes)('rejects an anonymous request to /admin/%s with 401', async (route) => {
      await request(server).get(`/api/v1/admin/${route}`).expect(401);
    });

    it.each(adminRoutes)('rejects a USER request to /admin/%s with 403', async (route) => {
      await request(server)
        .get(`/api/v1/admin/${route}`)
        .set(...buyer.auth)
        .expect(403);
    });

    it.each(adminRoutes)('rejects an AGENT request to /admin/%s with 403', async (route) => {
      await request(server)
        .get(`/api/v1/admin/${route}`)
        .set(...agentA.auth)
        .expect(403);
    });

    it.each(adminRoutes)('allows an ADMIN request to /admin/%s', async (route) => {
      await request(server)
        .get(`/api/v1/admin/${route}`)
        .set(...admin.auth)
        .expect(200);
    });

    it('never exposes password or token columns in the user list', async () => {
      const res = await request(server)
        .get('/api/v1/admin/users?limit=20')
        .set(...admin.auth)
        .expect(200);

      const body = JSON.stringify(res.body);

      expect(body).not.toContain('password');
      expect(body).not.toContain('hashedRefreshToken');
      expect(body).not.toContain('passwordResetToken');
      expect(body).not.toContain('$2b$');
    });
  });

  describe('admin property moderation', () => {
    let propertyId: string;

    beforeAll(async () => {
      const res = await request(server)
        .post('/api/v1/properties')
        .set(...agentA.auth)
        .send({
          title: 'Moderation Fixture Listing',
          description: 'Submitted for moderation so approval and rejection can be verified.',
          price: 375000,
          purpose: 'SALE',
          propertyType: 'TOWNHOUSE',
          area: 210,
          address: '7 Test Street',
          city: 'Testville',
          country: 'Testland',
          isPublished: true,
        })
        .expect(201);

      propertyId = res.body.data.id;
      expect(res.body.data.status).toBe(PropertyStatus.PENDING);
    });

    it('forbids an agent from approving their own listing', async () => {
      await request(server)
        .patch(`/api/v1/admin/properties/${propertyId}/approve`)
        .set(...agentA.auth)
        .expect(403);
    });

    it('publishes the listing when an admin approves it', async () => {
      const res = await request(server)
        .patch(`/api/v1/admin/properties/${propertyId}/approve`)
        .set(...admin.auth)
        .expect(200);

      expect(res.body.data).toMatchObject({
        status: PropertyStatus.APPROVED,
        isApproved: true,
        isPublished: true,
      });
    });

    it('makes the approved listing publicly visible', async () => {
      await request(server).get(`/api/v1/properties/${propertyId}`).expect(200);
    });

    it('notifies the agent that the listing was approved', async () => {
      const res = await request(server)
        .get('/api/v1/notifications?limit=50')
        .set(...agentA.auth)
        .expect(200);

      expect(res.body.data.some((n: { type: string }) => n.type === 'PROPERTY_APPROVED')).toBe(
        true,
      );
    });

    it('rejects a second approval', async () => {
      await request(server)
        .patch(`/api/v1/admin/properties/${propertyId}/approve`)
        .set(...admin.auth)
        .expect(400);
    });

    it('unpublishes the listing when an admin rejects it, recording the reason', async () => {
      const res = await request(server)
        .patch(`/api/v1/admin/properties/${propertyId}/reject`)
        .set(...admin.auth)
        .send({ reason: 'Photographs do not match the stated address.' })
        .expect(200);

      expect(res.body.data.status).toBe(PropertyStatus.REJECTED);
      expect(res.body.data.isPublished).toBe(false);
      expect(res.body.data.rejectionReason).toMatch(/Photographs/);
    });

    it('hides the rejected listing from the public again', async () => {
      await request(server).get(`/api/v1/properties/${propertyId}`).expect(404);
    });

    it('requires a reason when rejecting', async () => {
      await request(server)
        .patch(`/api/v1/admin/properties/${propertyId}/reject`)
        .set(...admin.auth)
        .send({})
        .expect(400);
    });
  });

  describe('user profile isolation', () => {
    it('returns the profile belonging to the token, not a requested id', async () => {
      const res = await request(server)
        .get('/api/v1/users/me')
        .set(...buyer.auth)
        .expect(200);

      expect(res.body.data.id).toBe(buyer.userId);
      expect(res.body.data.email).toBe(buyer.email);
    });

    it('updates only the caller own profile', async () => {
      const res = await request(server)
        .patch('/api/v1/users/me')
        .set(...buyer.auth)
        .send({ name: 'Renamed Buyer' })
        .expect(200);

      expect(res.body.data.id).toBe(buyer.userId);
      expect(res.body.data.name).toBe('Renamed Buyer');

      const other = await request(server)
        .get('/api/v1/users/me')
        .set(...otherBuyer.auth)
        .expect(200);

      expect(other.body.data.name).not.toBe('Renamed Buyer');
    });

    it('rejects an attempt to change role through the profile endpoint', async () => {
      await request(server)
        .patch('/api/v1/users/me')
        .set(...buyer.auth)
        .send({ role: UserRole.ADMIN })
        .expect(400);
    });

    it('requires the current password to change password', async () => {
      await request(server)
        .patch('/api/v1/users/me/password')
        .set(...buyer.auth)
        .send({ currentPassword: 'Wr0ng!Password', newPassword: 'An0ther!Password' })
        .expect(401);
    });
  });

  describe('error envelope', () => {
    it('returns a structured 404 without internal details', async () => {
      const res = await request(server)
        .get('/api/v1/properties/11111111-1111-4111-8111-111111111111')
        .expect(404);

      expect(res.body).toMatchObject({
        success: false,
        statusCode: 404,
        error: 'Not Found',
        path: '/api/v1/properties/11111111-1111-4111-8111-111111111111',
      });
      expect(res.body.timestamp).toEqual(expect.any(String));
      expect(res.body).not.toHaveProperty('stack');
    });

    it('returns 400 with field details for a malformed UUID', async () => {
      const res = await request(server).get('/api/v1/properties/not-a-uuid').expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.statusCode).toBe(400);
    });
  });
});
