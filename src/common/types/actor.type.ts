import { UserRole } from '@prisma/client';

export type Actor = {
  id: string;
  role: UserRole;
};
