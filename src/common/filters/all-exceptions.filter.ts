import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

interface ErrorBody {
  success: false;
  statusCode: number;
  message: string;
  error: string;
  details?: string[];
  path: string;
  timestamp: string;
}

/**
 * Single exit point for every error leaving the HTTP layer.
 *
 * Known Prisma error codes are translated into meaningful HTTP statuses;
 * anything unrecognised becomes a generic 500 so internal details
 * (SQL, stack traces, connection strings) never reach the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly config: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, error, details } = this.resolve(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${status}: ${message}`);
    }

    const body: ErrorBody = {
      success: false,
      statusCode: status,
      message,
      error,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (details?.length) {
      body.details = details;
    }

    response.status(status).json(body);
  }

  private resolve(exception: unknown): {
    status: number;
    message: string;
    error: string;
    details?: string[];
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return { status, message: payload, error: this.errorName(status) };
      }

      const record = payload as Record<string, unknown>;
      const rawMessage = record.message;

      // class-validator produces `message: string[]`; surface it as `details`.
      if (Array.isArray(rawMessage)) {
        return {
          status,
          message: 'Validation failed',
          error: (record.error as string) ?? this.errorName(status),
          details: rawMessage.map(String),
        };
      }

      return {
        status,
        message: (rawMessage as string) ?? this.errorName(status),
        error: (record.error as string) ?? this.errorName(status),
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrisma(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'The request contains invalid data for this operation',
        error: 'Bad Request',
      };
    }

    const isProduction = this.config.get<string>('app.nodeEnv') === 'production';
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message:
        !isProduction && exception instanceof Error
          ? exception.message
          : 'An unexpected error occurred. Please try again later.',
      error: 'Internal Server Error',
    };
  }

  private fromPrisma(exception: Prisma.PrismaClientKnownRequestError): {
    status: number;
    message: string;
    error: string;
    details?: string[];
  } {
    const target = exception.meta?.target;
    const fields = Array.isArray(target) ? target.map(String) : target ? [String(target)] : [];

    switch (exception.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          message: fields.length
            ? `A record with this ${fields.join(', ')} already exists`
            : 'A record with these details already exists',
          error: 'Conflict',
          details: fields,
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Referenced record does not exist',
          error: 'Bad Request',
        };
      case 'P2014':
        return {
          status: HttpStatus.CONFLICT,
          message: 'This change would violate an existing relation between records',
          error: 'Conflict',
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'The requested record was not found',
          error: 'Not Found',
        };
      default:
        this.logger.error(`Unhandled Prisma error ${exception.code}`, exception.message);
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'A database error occurred. Please try again later.',
          error: 'Internal Server Error',
        };
    }
  }

  private errorName(status: number): string {
    return (
      Object.entries(HttpStatus).find(([, value]) => value === status)?.[0] ??
      'Error'
    )
      .toLowerCase()
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
