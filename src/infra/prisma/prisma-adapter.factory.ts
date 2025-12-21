import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

export function createPrismaWithPgAdapter(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  return {
    prisma,
    disconnect: async () => {
      await prisma.$disconnect();
      await pool.end();
    },
  };
}
