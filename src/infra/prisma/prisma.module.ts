import { Global, Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, AuditService, RateLimitService],
  exports: [PrismaService, AuditService, RateLimitService],
})
export class PrismaModule {}
