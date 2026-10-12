import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limiting guard used application-wide.
 *
 * Throttling is disabled when NODE_ENV is "test" or "development": the e2e
 * suite and local manual testing both exercise registration and login far
 * more often than any real client would, and the per-route `@Throttle()`
 * limits would otherwise return 429 mid-suite or mid-testing.
 * It is always active in production.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(): Promise<boolean> {
    return process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';
  }
}
