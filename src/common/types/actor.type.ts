import { UserRole } from '@prisma/client';

export type Actor = {
  id: string;
  role: UserRole;
};
// Actor es el contrato interno estable (id + role) para autorizacion en modulos.
// No depender de claims JWT directos en el dominio.
