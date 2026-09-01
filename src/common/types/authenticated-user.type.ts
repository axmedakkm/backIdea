import { UserRole } from '@prisma/client';

/** Shape attached to `request.user` after a successful JWT validation. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  isEmailVerified: boolean;
  /** Present only when the user also has an agent profile. */
  agentId: string | null;
}

/** JWT payload shared by access and refresh tokens. */
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  type: 'access' | 'refresh';
  /**
   * Unique token ID, set on refresh tokens only.
   *
   * Without it, two refresh tokens signed within the same second are
   * byte-identical (same `iat`), which would silently defeat rotation
   * and the replay check that depends on it.
   */
  jti?: string;
  iat?: number;
  exp?: number;
}
