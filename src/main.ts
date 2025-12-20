import {
  HttpStatus,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter';
import { mapValidationErrors } from './common/utils/validation-errors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      exceptionFactory: (errors) =>
        new UnprocessableEntityException({
          message: 'Validation failed',
          errors: mapValidationErrors(errors),
        }),
    }),
  );

  const configService = app.get(ConfigService);
  const port = configService.get<number>('APP_PORT') ?? 3000;
  await app.listen(port);
}
bootstrap();
