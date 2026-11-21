import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const platform = await prisma.tenant.upsert({
    where: { slug: process.env.PLATFORM_TENANT_SLUG || 'snacki' },
    update: { name: process.env.PLATFORM_TENANT_NAME || 'Snacki', isActive: true },
    create: { slug: process.env.PLATFORM_TENANT_SLUG || 'snacki', name: process.env.PLATFORM_TENANT_NAME || 'Snacki', isActive: true },
  });

  for (const t of [
    { name: 'Burger House', slug: 'burger-house' },
    { name: 'Pizza Hut', slug: 'pizza-hut' },
    { name: 'Quattro d', slug: 'quattro-d' },
    { name: 'Spaghettoteca', slug: 'spaghettoteca' },
  ]) {
    await prisma.tenant.upsert({ where: { slug: t.slug }, update: { name: t.name, isActive: true }, create: { ...t, isActive: true } });
  }

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

    const burger = await prisma.tenant.findUnique({ where: { slug: 'burger-house' } });
    if (burger) {
      const comercio = await prisma.user.upsert({
        where: { email: 'comercio@snacki.demo' },
        update: { fullName: 'Comercio Demo', passwordHash, isActive: true },
        create: { email: 'comercio@snacki.demo', fullName: 'Comercio Demo', passwordHash, isActive: true },
      });
      await prisma.userTenantRoleMap.upsert({
        where: { userId_tenantId: { userId: comercio.id, tenantId: burger.id } },
        update: { role: 'comercio' },
        create: { userId: comercio.id, tenantId: burger.id, role: 'comercio' },
      });
    }
  }

  console.log('Seed completed');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());