import { PrismaClient, TenantCategory } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysFromNow = (d: number) => new Date(now + d * DAY);

type SeedTenant = {
  name: string;
  slug: string;
  category: TenantCategory;
  address: string;
  latitude: number;
  longitude: number;
  logoUrl: string | null;
  products: { name: string; description: string; points: number; imageUrl: string | null }[];
  rewards: { name: string; cost: number }[];
};

// 4 tiendas demo (nombres ficticios), con coordenadas cercanas entre sí para probar "comercios cercanos".
const TENANTS: SeedTenant[] = [
  {
    name: 'Burger House', slug: 'burger-house', category: 'comida_rapida',
    address: 'Av. Principal 120', latitude: -33.4372, longitude: -70.6506,
    logoUrl: 'assets/img/logo-burger-house.png',
    products: [
      { name: 'Combo Bacon nuevo', description: 'Hamburguesa con bacon, papas y bebida', points: 300, imageUrl: 'assets/img/prod-combo-bacon.jpg' },
      { name: 'Nuggets x10', description: 'Nuevos nuggets crujientes', points: 150, imageUrl: 'assets/img/prod-nuggets.jpg' },
    ],
    rewards: [{ name: 'Papas medianas gratis', cost: 600 }, { name: 'Combo Bacon gratis', cost: 2500 }],
  },
  {
    name: 'Heladería Polar', slug: 'heladeria-polar', category: 'helado',
    address: 'Paseo Central 78', latitude: -33.4355, longitude: -70.6530,
    logoUrl: null,
    products: [
      { name: 'Helado Pistacho Crunch', description: 'Nuevo sabor de temporada', points: 200, imageUrl: 'assets/img/prod-helado.jpg' },
      { name: 'Copa Brownie', description: 'Dos bolas, brownie y salsa de chocolate', points: 300, imageUrl: null },
    ],
    rewards: [{ name: 'Cono simple gratis', cost: 1000 }, { name: 'Copa Brownie gratis', cost: 2200 }],
  },
  {
    name: 'Café Central', slug: 'cafe-central', category: 'cafe',
    address: 'Plaza Mayor 10', latitude: -33.4390, longitude: -70.6550,
    logoUrl: null,
    products: [
      { name: 'Latte Caramelo', description: 'Café mediano nuevo', points: 250, imageUrl: null },
      { name: 'Ensalada Fresca', description: 'Nueva opción liviana', points: 200, imageUrl: 'assets/img/prod-ensalada.jpg' },
    ],
    rewards: [{ name: 'Café chico gratis', cost: 1500 }, { name: 'Café mediano gratis', cost: 2500 }],
  },
  {
    name: 'Pizzería Napoli', slug: 'pizzeria-napoli', category: 'pizza',
    address: 'Calle Comercio 455', latitude: -33.4410, longitude: -70.6480,
    logoUrl: null,
    products: [
      { name: 'Pizza Pepperoni Extra', description: 'Lanzamiento con doble pepperoni', points: 400, imageUrl: null },
      { name: 'Calzone Napolitano', description: 'Relleno de jamón, queso y tomate', points: 350, imageUrl: null },
    ],
    rewards: [{ name: 'Bebida 1.5L gratis', cost: 800 }, { name: 'Pizza mediana gratis', cost: 3000 }],
  },
];

/** Tiendas de seeds anteriores: se desactivan (no se borran, por si tienen historial de puntos). */
const RETIRED_SLUGS = ['pizza-hut', 'quattro-d', 'spaghettoteca'];

/** Usuario comercio de demo para cada tienda (contraseña Demo1234!). */
const MERCHANT_USERS: { email: string; fullName: string; slug: string }[] = [
  { email: 'comercio@snacki.demo', fullName: 'Comercio Demo', slug: 'burger-house' },
  { email: 'heladeria@snacki.demo', fullName: 'Heladería Demo', slug: 'heladeria-polar' },
  { email: 'cafeteria@snacki.demo', fullName: 'Cafetería Demo', slug: 'cafe-central' },
  { email: 'pizzeria@snacki.demo', fullName: 'Pizzería Demo', slug: 'pizzeria-napoli' },
];

async function main() {
  const platform = await prisma.tenant.upsert({
    where: { slug: process.env.PLATFORM_TENANT_SLUG || 'snacki' },
    update: { name: process.env.PLATFORM_TENANT_NAME || 'Snacki', isActive: true },
    create: { slug: process.env.PLATFORM_TENANT_SLUG || 'snacki', name: process.env.PLATFORM_TENANT_NAME || 'Snacki', isActive: true },
  });

  const tenantIds: Record<string, string> = {};
  for (const t of TENANTS) {
    const data = {
      name: t.name, category: t.category, address: t.address, latitude: t.latitude,
      longitude: t.longitude, logoUrl: t.logoUrl, pointsExpireAt: daysFromNow(90), isActive: true,
    };
    const tenant = await prisma.tenant.upsert({ where: { slug: t.slug }, update: data, create: { slug: t.slug, ...data } });
    tenantIds[t.slug] = tenant.id;

    // Catálogo idempotente: se reemplaza en cada seed (sin tocar lo que ya tiene QR o canjes).
    await prisma.$transaction([
      prisma.product.deleteMany({ where: { tenantId: tenant.id, claims: { none: {} } } }),
      prisma.reward.deleteMany({ where: { tenantId: tenant.id, redemptions: { none: {} } } }),
      // Lo que no se pudo borrar (tiene historial) se archiva para que no aparezca duplicado.
      prisma.product.updateMany({ where: { tenantId: tenant.id, deletedAt: null }, data: { deletedAt: new Date(), isActive: false } }),
      prisma.reward.updateMany({ where: { tenantId: tenant.id, deletedAt: null }, data: { deletedAt: new Date(), isActive: false } }),
      prisma.product.createMany({
        data: t.products.map((p) => ({ ...p, tenantId: tenant.id, promoStartsAt: daysFromNow(-1), promoEndsAt: daysFromNow(30) })),
      }),
      prisma.reward.createMany({ data: t.rewards.map((r) => ({ ...r, tenantId: tenant.id })) }),
    ]);
  }

  await prisma.tenant.updateMany({ where: { slug: { in: RETIRED_SLUGS } }, data: { isActive: false } });

  if (process.env.SEED_DEMO_USERS === 'true') {
    const passwordHash = await bcrypt.hash('Demo1234!', 10);

    const cliente = await prisma.user.upsert({
      where: { email: 'cliente@snacki.demo' },
      update: { fullName: 'Cliente Demo', passwordHash, isActive: true },
      create: { email: 'cliente@snacki.demo', fullName: 'Cliente Demo', passwordHash, isActive: true },
    });
    await prisma.userTenantRoleMap.upsert({
      where: { userId_tenantId: { userId: cliente.id, tenantId: platform.id } },
      update: { role: 'cliente' },
      create: { userId: cliente.id, tenantId: platform.id, role: 'cliente' },
    });

    for (const m of MERCHANT_USERS) {
      const user = await prisma.user.upsert({
        where: { email: m.email },
        update: { fullName: m.fullName, passwordHash, isActive: true },
        create: { email: m.email, fullName: m.fullName, passwordHash, isActive: true },
      });
      await prisma.userTenantRoleMap.upsert({
        where: { userId_tenantId: { userId: user.id, tenantId: tenantIds[m.slug] } },
        update: { role: 'comercio' },
        create: { userId: user.id, tenantId: tenantIds[m.slug], role: 'comercio' },
      });
    }

    // Saldo inicial de ejemplo (entradas sin QR ni canje asociado, se recrean en cada seed).
    await prisma.pointEntry.deleteMany({ where: { userId: cliente.id, claimId: null, rewardId: null } });
    await prisma.pointEntry.createMany({
      data: [
        { slug: 'burger-house', points: 450, expires: 60 },
        { slug: 'cafe-central', points: 1750, expires: 60 },
        { slug: 'pizzeria-napoli', points: 900, expires: 45 },
        { slug: 'heladeria-polar', points: 300, expires: -1 }, // vencido: no debe contar en el saldo
      ].map((e) => ({
        userId: cliente.id, tenantId: tenantIds[e.slug], type: 'EARN' as const,
        points: e.points, remaining: e.points, expiresAt: daysFromNow(e.expires),
      })),
    });
  }

  console.log('Seed completed');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
