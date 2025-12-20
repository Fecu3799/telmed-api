import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let detail = 'Unexpected error';
    let errors: Record<string, string[]> | string[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
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

    response.status(status).json(body);
  }
}
