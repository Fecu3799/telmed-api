import {
  HttpStatus,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpLoggingInterceptor } from './common/interceptors/http-logging.interceptor';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter';
import { mapValidationErrors } from './common/utils/validation-errors';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PerfInterceptor } from './infra/performance/perf.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ProblemDetailsFilter());

  const configService = app.get(ConfigService);
  const perfMetricsEnabled =
    configService.get<boolean>('PERF_METRICS_ENABLED') ?? true;

  // Use PerfInterceptor if metrics enabled, otherwise use HttpLoggingInterceptor
  if (perfMetricsEnabled) {
    const perfInterceptor = app.get(PerfInterceptor);
    app.useGlobalInterceptors(perfInterceptor);
  } else {
    app.useGlobalInterceptors(new HttpLoggingInterceptor());
  }
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

  app.enableCors({
    origin: [
      'http://localhost:5173',
      'https://overlively-selena-monophyly.ngrok-free.dev',
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Trace-Id'],
    exposedHeaders: ['X-Trace-Id'],
    credentials: false, // ponelo en true SOLO si usás cookies/sessions por cookie
    optionsSuccessStatus: 204,
  });

  // Swagger lives at /api/docs and documents the prefixed routes.
  const config = new DocumentBuilder()
    .setTitle('TelmedDelSur - API')
    .setDescription('API backend para plataforma de telemedicina (MVP)')
    .setVersion('1.0')
    .addServer('/api/v1')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = configService.get<number>('APP_PORT') ?? 3000;
  await app.listen(port);
}
void bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
