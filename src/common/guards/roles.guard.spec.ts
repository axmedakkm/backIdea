import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../types/authenticated-user.type';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const buildContext = (user?: AuthenticatedUser): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    }) as unknown as ExecutionContext;

  const userWithRole = (role: UserRole): AuthenticatedUser => ({
    id: 'a3f1c9e7-0000-4000-8000-000000000001',
    email: 'person@example.com',
    role,
    isEmailVerified: true,
    agentId: role === UserRole.AGENT ? 'a3f1c9e7-0000-4000-8000-000000000002' : null,
  });

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('allows the request when no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    expect(guard.canActivate(buildContext(userWithRole(UserRole.USER)))).toBe(true);
  });

  it('allows the request when the required roles list is empty', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);

    expect(guard.canActivate(buildContext(userWithRole(UserRole.USER)))).toBe(true);
  });

  it('allows a user whose role is listed', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);

    expect(guard.canActivate(buildContext(userWithRole(UserRole.ADMIN)))).toBe(true);
  });

  it('allows a user matching any one of several required roles', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.AGENT, UserRole.ADMIN]);

    expect(guard.canActivate(buildContext(userWithRole(UserRole.AGENT)))).toBe(true);
  });

  it('rejects a USER from an ADMIN-only route', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);

    expect(() => guard.canActivate(buildContext(userWithRole(UserRole.USER)))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects an AGENT from an ADMIN-only route', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);

    expect(() => guard.canActivate(buildContext(userWithRole(UserRole.AGENT)))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects an unauthenticated request to a role-restricted route', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);

    expect(() => guard.canActivate(buildContext(undefined))).toThrow(ForbiddenException);
  });

  it('names the required roles in the error message', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.AGENT, UserRole.ADMIN]);

    expect(() => guard.canActivate(buildContext(userWithRole(UserRole.USER)))).toThrow(
      /AGENT, ADMIN/,
    );
  });
});
