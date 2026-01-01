import {
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
import { DoctorsModule } from './modules/doctors/doctors.module';
import { SpecialtiesModule } from './modules/specialties/specialties.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { ConsultationQueueModule } from './modules/consultation-queue/consultation-queue.module';
import { ConsultationsModule } from './modules/consultations/consultations.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ClockModule } from './common/clock/clock.module';
import { createRateLimitMiddleware } from './common/middleware/rate-limit.middleware';
import { TraceIdMiddleware } from './common/middleware/trace-id.middleware';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
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
    ...(process.env.NODE_ENV === 'test' ||
    String(process.env.THROTTLE_ENABLED).toLowerCase() === 'false'
      ? []
      : [
          ThrottlerModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
              throttlers: [{ name: 'default', ttl: 60_000, limit: 60 }],
              storage:
                configService.get<string>('APP_ENV') === 'test'
                  ? undefined
                  : new ThrottlerStorageRedisService(
                      configService.getOrThrow<string>('REDIS_URL'),
                    ),
            }),
          }),
        ]),
    AuthModule,
    UsersModule,
    PatientsIdentityModule,
    DoctorsModule,
    SpecialtiesModule,
    AppointmentsModule,
    PaymentsModule,
    ConsultationQueueModule,
    ConsultationsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    ...(process.env.NODE_ENV === 'test' ||
    String(process.env.THROTTLE_ENABLED).toLowerCase() === 'false'
      ? []
      : [{ provide: APP_GUARD, useClass: ThrottlerGuard }]),
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
          keyPrefix: 'enable-payment',
          limit: 30,
          windowMs: 60_000,
        }),
      )
      .forRoutes({
        path: 'consultations/queue/:queueId/enable-payment',
        method: RequestMethod.POST,
      });
  }
}
