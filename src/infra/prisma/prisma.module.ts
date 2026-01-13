import { Global, Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [
    PrismaService,
    AuditService,
    RateLimitService,
    RedisService,
    StorageService,
  ],
  exports: [
    PrismaService,
    AuditService,
    RateLimitService,
    RedisService,
    StorageService,
  ],
})
export class PrismaModule {
  // PrismaService will be injected with PerfService if available via forwardRef
  // We keep it simple and use Optional injection in PrismaService constructor
}
