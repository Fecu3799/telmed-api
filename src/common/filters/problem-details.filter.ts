import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let detail = 'Unexpected error';
    let errorCode: string | undefined;
    let errors: Record<string, string[]> | string[] | undefined;
    let extensions: Record<string, unknown> | undefined;

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      errorCode = exception.code;
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        detail = 'Resource already exists';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        detail = 'Resource not found';
      } else {
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        detail = 'Database error';
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      errorCode = String(status);
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        detail = payload;
      } else if (typeof payload === 'object' && payload) {
        const responseBody = payload as Record<string, unknown>;
        if (Array.isArray(responseBody.message)) {
          detail = 'Validation failed';
          errors = responseBody.message as string[];
        } else if (typeof responseBody.message === 'string') {
          detail = responseBody.message;
        } else if (typeof responseBody.detail === 'string') {
          detail = responseBody.detail;
        }

        if (responseBody.errors) {
          errors = responseBody.errors as Record<string, string[]>;
        }

        if (responseBody.extensions) {
          extensions = responseBody.extensions as Record<string, unknown>;
        }
      }
    }

    const body: Record<string, unknown> = {
      type: 'about:blank',
      title: HttpStatus[status] ?? 'Error',
      status,
      detail,
      instance: request.originalUrl,
    };

    if (errors) {
      body.errors = errors;
    }

    if (extensions) {
      body.extensions = extensions;
    }

    const traceId = (request as Request & { traceId?: string }).traceId ?? null;
    this.logger.error(
      JSON.stringify({
        traceId,
        errorCode: errorCode ?? 'unknown',
        status,
        detail,
        path: request.originalUrl,
      }),
    );

    response.status(status).json(body);
  }
}
