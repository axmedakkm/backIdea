import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Populates `request.user` when a valid token is supplied but never rejects.
 *
 * Used on public listing endpoints that enrich the response for signed-in
 * callers (for example flagging which properties they have favourited).
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest<TUser>(_err: Error | null, user: TUser): TUser | undefined {
    return user || undefined;
  }
}
