import {
  Logger,
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { envSchema } from './infra/config/env.schema';
import { PrismaModule } from './infra/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PatientsIdentityModule } from './modules/patients-identity/patients-identity.module';
import { PatientsClinicalProfileModule } from './modules/patients-clinical-profile/patients-clinical-profile.module';
import { DoctorsModule } from './modules/doctors/doctors.module';
import { SpecialtiesModule } from './modules/specialties/specialties.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { ConsultationQueueModule } from './modules/consultation-queue/consultation-queue.module';
import { ConsultationsModule } from './modules/consultations/consultations.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ChatsModule } from './modules/chats/chats.module';
import { PatientFilesModule } from './modules/patient-files/patient-files.module';
import { GeoModule } from './modules/geo/geo.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ClinicalNoteFormatModule } from './modules/clinical-note-format/clinical-note-format.module';
import { ClockModule } from './common/clock/clock.module';
import { createRateLimitMiddleware } from './common/middleware/rate-limit.middleware';
import { TraceIdMiddleware } from './common/middleware/trace-id.middleware';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PerformanceModule } from './infra/performance/performance.module';
import { BenchmarkThrottlerGuard } from './common/guards/benchmark-throttler.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
      validate: (env) => {
        const result = envSchema.safeParse(env);
        if (!result.success) {
          const formatted = result.error.flatten().fieldErrors;
          throw new Error(
            `Invalid environment variables: ${JSON.stringify(formatted)}`,
          );
        }
        return result.data;
      },
    }),
    PrismaModule,
    ClockModule,
    PerformanceModule.forRootWithController(),
    ...(process.env.NODE_ENV === 'test' ||
    String(process.env.THROTTLE_ENABLED).toLowerCase() === 'false'
      ? []
      : [
          ThrottlerModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => {
              const nodeEnv = process.env.NODE_ENV || 'development';
              const throttleEnabled =
                configService.get<boolean>('THROTTLE_ENABLED') ?? true;

              const benchmarkModeValue = configService.get(
                'THROTTLE_BENCHMARK_MODE',
              );
              const benchmarkModeStr =
                benchmarkModeValue !== undefined && benchmarkModeValue !== null
                  ? String(benchmarkModeValue)
                  : 'false';
              const benchmarkMode = benchmarkModeStr.toLowerCase() === 'true';

              const isBenchmarkMode = benchmarkMode && nodeEnv !== 'production';

              let ttl = 60_000;
              let limit = 60;

              if (isBenchmarkMode) {
                const ttlSecondsDev = Number(
                  configService.get('THROTTLE_TTL_SECONDS_DEV') ?? 60,
                );
                const limitDev = Number(
                  configService.get('THROTTLE_LIMIT_DEV') ?? 1000,
                );
                ttl = ttlSecondsDev * 1000;
                limit = limitDev;
              }

              const logger = new Logger('ThrottlerModule');
              logger.log(
                `Throttler config: nodeEnv=${nodeEnv}, enabled=${throttleEnabled}, benchmarkMode=${benchmarkMode}, ttl=${ttl}ms, limit=${limit}`,
              );

              return {
                throttlers: [{ name: 'default', ttl, limit }],
                storage:
                  configService.get<string>('APP_ENV') === 'test'
                    ? undefined
                    : new ThrottlerStorageRedisService(
                        configService.getOrThrow<string>('REDIS_URL'),
                      ),
              };
            },
          }),
        ]),
    AuthModule,
    UsersModule,
    PatientsIdentityModule,
    PatientsClinicalProfileModule,
    DoctorsModule,
    SpecialtiesModule,
    AppointmentsModule,
    PaymentsModule,
    ConsultationQueueModule,
    ConsultationsModule,
    ChatsModule,
    PatientFilesModule,
    GeoModule,
    NotificationsModule,
    ClinicalNoteFormatModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    ...(process.env.NODE_ENV === 'test' ||
    String(process.env.THROTTLE_ENABLED).toLowerCase() === 'false'
      ? []
      : [{ provide: APP_GUARD, useClass: BenchmarkThrottlerGuard }]),
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TraceIdMiddleware).forRoutes('*');
    consumer
      .apply(
        createRateLimitMiddleware({
          keyPrefix: 'auth-register',
          limit: 10,
          windowMs: 60_000,
        }),
      )
      .forRoutes({ path: 'auth/register', method: RequestMethod.POST });
    consumer
      .apply(
        createRateLimitMiddleware({
          keyPrefix: 'auth-login',
          limit: 10,
          windowMs: 60_000,
        }),
      )
      .forRoutes({ path: 'auth/login', method: RequestMethod.POST });
    consumer
      .apply(
        createRateLimitMiddleware({
          keyPrefix: 'payments-webhook',
          limit: 60,
          windowMs: 60_000,
        }),
      )
      .forRoutes({
        path: 'payments/webhooks/mercadopago',
        method: RequestMethod.POST,
      });
    consumer
      .apply(
        createRateLimitMiddleware({
          keyPrefix: 'queue-payment',
          limit: 30,
          windowMs: 60_000,
        }),
      )
      .forRoutes({
        path: 'consultations/queue/:queueItemId/payment',
        method: RequestMethod.POST,
      });
  }
}
