import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import { API_MESSAGE_KEY } from '../decorators/api-message.decorator';
import { PaginationMeta } from '../dto/api-response.dto';
import { PaginatedResult } from '../utils/pagination.util';

interface Envelope<T> {
  success: true;
  message: string;
  data: T;
  meta?: PaginationMeta;
}

/**
 * Wraps every successful controller return value in the standard envelope.
 * Services that return a `PaginatedResult` get their `meta` lifted to the top level.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, Envelope<unknown>> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<Envelope<unknown>> {
    const message =
      this.reflector.getAllAndOverride<string>(API_MESSAGE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'Request completed successfully';

    return next.handle().pipe(
      map((payload) => {
        if (payload instanceof PaginatedResult) {
          return {
            success: true as const,
            message,
            data: payload.items,
            meta: payload.meta,
          };
        }

        return {
          success: true as const,
          message,
          data: payload ?? null,
        };
      }),
    );
  }
}
