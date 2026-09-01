import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'auth:roles';

/**
 * Restricts a route to the listed roles. Requires `RolesGuard` to be active.
 *
 * @example `@Roles(UserRole.ADMIN)`
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
