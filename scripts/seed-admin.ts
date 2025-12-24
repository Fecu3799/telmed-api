import 'dotenv/config';
import { UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

import { createPrismaWithPgAdapter } from '../src/infra/prisma/prisma-adapter.factory';

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is required`);
    process.exit(1);
  }
  return value;
}

const email = getEnv('SEED_ADMIN_EMAIL').toLowerCase();
const password = getEnv('SEED_ADMIN_PASSWORD');

async function main() {
  const { prisma, disconnect } = createPrismaWithPgAdapter(
    getEnv('DATABASE_URL'),
  );

  try {
    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      if (existing.role !== UserRole.admin) {
        console.warn('User exists but is not admin; skipping seed');
      } else {
        console.log('Admin user already exists; skipping seed');
      }
      return;
    }

    const passwordHash = await argon2.hash(password);

    await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: UserRole.admin,
      },
    });

    console.log('Admin user created');
  } finally {
    await disconnect();
  }
}

main().catch((err) => {
  console.error('Seed failed');
  console.error(err);
  process.exit(1);
});
