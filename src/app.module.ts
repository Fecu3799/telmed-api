import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { envSchema } from './infra/config/env.schema';
import { PrismaModule } from './infra/prisma/prisma.module';
import { RolesGuard } from './common/guards/roles.guard';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PatientProfilesModule } from './modules/patient-profiles/patient-profiles.module';
import { DoctorProfilesModule } from './modules/doctor-profiles/doctor-profiles.module';
import { SpecialtiesModule } from './modules/specialties/specialties.module';
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
    PatientProfilesModule,
    DoctorProfilesModule,
    SpecialtiesModule,
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
export class AppModule {}
