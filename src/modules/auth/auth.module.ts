import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccessTokenStrategy } from './strategies/access-token.strategy';
import { PatientsIdentityModule } from '../patients-identity/patients-identity.module';

/**
 * AuthModule
 * - Agrupa y expone la infraestructura de autenticación (JWT, strategies, service)
 *
 * How it works:
 * - Importa ConfigModule y configura JWTModule con secrets/TTL de env.
 * - Importa PatientsIdentityModule para consultar estado de identidad.
 * - Expone AuthService.
 *
 * Key points:
 * - si el proyecto usa APP_NODE/NODE_ENV, acá suele influir en defaults de config.
 */

@Module({
  imports: [
    ConfigModule,
    PatientsIdentityModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AccessTokenStrategy],
  exports: [AuthService],
})
export class AuthModule {}
