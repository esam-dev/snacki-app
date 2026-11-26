import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../common/errors/app-error.js';

export type StaffRole = 'owner' | 'assistant';

/** Rol del usuario dentro de su comercio. Se consulta en la base (no en el JWT) para que un cambio aplique al instante. */
export async function getStaffRole(userId: string | undefined, tenantId: string | undefined): Promise<StaffRole> {
  if (!userId || !tenantId) throw new AppError(401, 'UNAUTHORIZED', 'No autenticado');
  const m = await prisma.userTenantRoleMap.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { staffRole: true },
  });
  if (!m) throw new AppError(403, 'FORBIDDEN', 'No tienes permisos para realizar esta acción');
  return m.staffRole as StaffRole;
}

export async function requireOwner(userId: string | undefined, tenantId: string | undefined): Promise<void> {
  if ((await getStaffRole(userId, tenantId)) !== 'owner') {
    throw new AppError(403, 'OWNER_ONLY', 'Solo la cuenta principal del local puede hacer esto');
  }
}
