import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET ??= 'test-jwt-secret-at-least-16';

const prismaMock = vi.hoisted(() => {
  const m: any = {
    user: { findUnique: vi.fn(), create: vi.fn() },
    tenant: { findUnique: vi.fn(), create: vi.fn(), upsert: vi.fn() },
    userTenantRoleMap: { create: vi.fn(), findUnique: vi.fn() },
    product: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    reward: { findFirst: vi.fn(), create: vi.fn() },
    changeRequest: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  };
  m.$transaction = vi.fn(async (fn: any) => fn(m));
  return m;
});
vi.mock('../src/lib/prisma.js', () => ({ prisma: prismaMock }));

const { authService } = await import('../src/modules/auth/auth.service.js');
const { registerSchema } = await import('../src/modules/auth/auth.schemas.js');
const { changeRequestsService } = await import('../src/modules/merchant/change-requests.service.js');
const { requireOwner, getStaffRole } = await import('../src/modules/merchant/staff.js');

const TENANT = '11111111-1111-4111-8111-111111111111';
const ASSISTANT = '22222222-2222-4222-8222-222222222222';
const OWNER = '33333333-3333-4333-8333-333333333333';
const PRODUCT = '44444444-4444-4444-8444-444444444444';
const REQ = '55555555-5555-4555-8555-555555555555';

const base = { fullName: 'Ana', email: 'ana@x.com', password: 'Password123', accountType: 'comercio' as const };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
});

describe('registro de comercio: esquema', () => {
  it('local nuevo exige nombre; sucursal exige comercio asociado', () => {
    expect(registerSchema.safeParse({ ...base, businessMode: 'new' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, businessMode: 'new', tenantName: 'Mi Local' }).success).toBe(true);
    expect(registerSchema.safeParse({ ...base, businessMode: 'branch' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, businessMode: 'branch', tenantId: TENANT }).success).toBe(true);
  });

  it('sin modo explícito, tenantId implica sucursal y su ausencia local nuevo', () => {
    expect(registerSchema.safeParse({ ...base, tenantId: TENANT }).success).toBe(true);
    expect(registerSchema.safeParse(base).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, accountType: 'cliente' }).success).toBe(true);
  });
});

describe('registro de comercio: servicio', () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: ASSISTANT, fullName: 'Ana', email: 'ana@x.com', isActive: true });
    prismaMock.userTenantRoleMap.create.mockImplementation(async ({ data }: any) => ({
      role: data.role, staffRole: data.staffRole, tenantId: data.tenantId, tenant: { id: data.tenantId, slug: 'mi-local', name: 'Mi Local' },
    }));
  });

  it('local nuevo: crea el comercio y deja al usuario como titular', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(null); // slug libre
    prismaMock.tenant.create.mockResolvedValue({ id: TENANT });
    const res = await authService.register({ ...base, businessMode: 'new', tenantName: 'Mi Local' } as any);
    expect(prismaMock.tenant.create.mock.calls[0][0].data).toMatchObject({ name: 'Mi Local', slug: 'mi-local', category: 'otro' });
    expect(prismaMock.userTenantRoleMap.create.mock.calls[0][0].data).toMatchObject({ tenantId: TENANT, role: 'comercio', staffRole: 'owner' });
    expect(res.membership.staffRole).toBe('owner');
  });

  it('local nuevo: si el slug existe agrega un sufijo', async () => {
    prismaMock.tenant.findUnique.mockResolvedValueOnce({ id: 'otro' }).mockResolvedValueOnce(null);
    prismaMock.tenant.create.mockResolvedValue({ id: TENANT });
    await authService.register({ ...base, businessMode: 'new', tenantName: 'Mi Local' } as any);
    expect(prismaMock.tenant.create.mock.calls[0][0].data.slug).toBe('mi-local-2');
  });

  it('sucursal: no crea comercio y deja al usuario como asistente', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({ id: TENANT, slug: 'burger-house', isActive: true });
    const res = await authService.register({ ...base, businessMode: 'branch', tenantId: TENANT } as any);
    expect(prismaMock.tenant.create).not.toHaveBeenCalled();
    expect(prismaMock.userTenantRoleMap.create.mock.calls[0][0].data).toMatchObject({ tenantId: TENANT, staffRole: 'assistant' });
    expect(res.membership.staffRole).toBe('assistant');
  });

  it('sucursal: rechaza comercios inexistentes o inactivos', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({ id: TENANT, slug: 'x', isActive: false });
    await expect(authService.register({ ...base, businessMode: 'branch', tenantId: TENANT } as any)).rejects.toMatchObject({ statusCode: 404 });
    prismaMock.tenant.findUnique.mockResolvedValue(null);
    await expect(authService.register({ ...base, businessMode: 'branch', tenantId: TENANT } as any)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('roles dentro del comercio', () => {
  it('getStaffRole lee el rol de la base y requireOwner bloquea a los asistentes', async () => {
    prismaMock.userTenantRoleMap.findUnique.mockResolvedValue({ staffRole: 'assistant' });
    expect(await getStaffRole(ASSISTANT, TENANT)).toBe('assistant');
    await expect(requireOwner(ASSISTANT, TENANT)).rejects.toMatchObject({ statusCode: 403 });
    prismaMock.userTenantRoleMap.findUnique.mockResolvedValue({ staffRole: 'owner' });
    await expect(requireOwner(OWNER, TENANT)).resolves.toBeUndefined();
  });
});

describe('solicitudes de cambio', () => {
  const PROMO = { name: ' Combo ', points: 300, promoStartsAt: '2026-11-01T00:00:00.000Z', promoEndsAt: '2026-12-31T00:00:00.000Z' };

  it('crear: valida con el esquema del API y guarda la solicitud sin tocar el catálogo', async () => {
    prismaMock.changeRequest.create.mockResolvedValue({ id: REQ, status: 'PENDING' });
    await changeRequestsService.submit(TENANT, ASSISTANT, { entity: 'product', action: 'create', body: PROMO });
    const data = prismaMock.changeRequest.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ tenantId: TENANT, requestedById: ASSISTANT, entity: 'product', action: 'create', targetName: 'Combo' });
    expect(prismaMock.product.create).not.toHaveBeenCalled();
  });

  it('rechaza datos inválidos antes de guardar', async () => {
    await expect(changeRequestsService.submit(TENANT, ASSISTANT, { entity: 'product', action: 'create', body: { name: 'x' } })).rejects.toThrow();
    expect(prismaMock.changeRequest.create).not.toHaveBeenCalled();
  });

  it('editar y borrar exigen que el elemento sea del local', async () => {
    prismaMock.product.findFirst.mockResolvedValue(null);
    await expect(changeRequestsService.submit(TENANT, ASSISTANT, { entity: 'product', action: 'delete', targetId: PRODUCT })).rejects.toMatchObject({ statusCode: 404 });
    prismaMock.product.findFirst.mockResolvedValue({ name: 'Combo' });
    prismaMock.changeRequest.create.mockResolvedValue({ id: REQ });
    await changeRequestsService.submit(TENANT, ASSISTANT, { entity: 'product', action: 'update', targetId: PRODUCT, body: { points: 10 } });
    expect(prismaMock.changeRequest.create.mock.calls[0][0].data).toMatchObject({ targetId: PRODUCT, targetName: 'Combo' });
  });

  it('el asistente solo ve sus solicitudes; el titular ve todas', async () => {
    prismaMock.changeRequest.findMany.mockResolvedValue([]);
    await changeRequestsService.list(TENANT, ASSISTANT, 'assistant');
    expect(prismaMock.changeRequest.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: TENANT, requestedById: ASSISTANT });
    await changeRequestsService.list(TENANT, OWNER, 'owner', 'PENDING');
    const where = prismaMock.changeRequest.findMany.mock.calls[1][0].where;
    expect(where).toEqual({ tenantId: TENANT, status: 'PENDING' });
  });

  it('aprobar aplica el cambio y marca la solicitud', async () => {
    prismaMock.changeRequest.findFirst.mockResolvedValue({ id: REQ, entity: 'product', action: 'create', targetId: null, payload: PROMO });
    prismaMock.changeRequest.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.product.create.mockResolvedValue({ id: PRODUCT });
    prismaMock.changeRequest.findUnique.mockResolvedValue({ id: REQ, status: 'APPROVED' });
    await changeRequestsService.approve(TENANT, OWNER, REQ);
    expect(prismaMock.changeRequest.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: REQ, status: 'PENDING' }, data: { status: 'APPROVED', reviewedById: OWNER } });
    expect(prismaMock.product.create.mock.calls[0][0].data).toMatchObject({ tenantId: TENANT, name: 'Combo', points: 300 });
  });

  it('aprobar dos veces responde 409 y no aplica el cambio de nuevo', async () => {
    prismaMock.changeRequest.findFirst.mockResolvedValue({ id: REQ, entity: 'product', action: 'create', payload: PROMO });
    prismaMock.changeRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(changeRequestsService.approve(TENANT, OWNER, REQ)).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.product.create).not.toHaveBeenCalled();
  });

  it('si aplicar falla, la solicitud vuelve a pendiente', async () => {
    prismaMock.changeRequest.findFirst.mockResolvedValue({ id: REQ, entity: 'product', action: 'update', targetId: PRODUCT, payload: { points: 5 } });
    prismaMock.changeRequest.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.product.findFirst.mockResolvedValue(null); // ya no existe
    await expect(changeRequestsService.approve(TENANT, OWNER, REQ)).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.changeRequest.updateMany.mock.calls[1][0]).toMatchObject({ data: { status: 'PENDING' } });
  });

  it('rechazar guarda el motivo y no toca el catálogo', async () => {
    prismaMock.changeRequest.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.changeRequest.findUnique.mockResolvedValue({ id: REQ, status: 'REJECTED' });
    await changeRequestsService.reject(TENANT, OWNER, REQ, ' Precio muy bajo ');
    expect(prismaMock.changeRequest.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'REJECTED', rejectionReason: 'Precio muy bajo' });
    expect(prismaMock.product.create).not.toHaveBeenCalled();
  });

  it('rechazar una solicitud ya revisada responde 409; inexistente 404', async () => {
    prismaMock.changeRequest.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.changeRequest.findFirst.mockResolvedValue({ id: REQ });
    await expect(changeRequestsService.reject(TENANT, OWNER, REQ)).rejects.toMatchObject({ statusCode: 409 });
    prismaMock.changeRequest.findFirst.mockResolvedValue(null);
    await expect(changeRequestsService.reject(TENANT, OWNER, REQ)).rejects.toMatchObject({ statusCode: 404 });
  });
});
