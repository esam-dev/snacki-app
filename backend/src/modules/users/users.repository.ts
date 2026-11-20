import { prisma } from '../../lib/prisma.js';

export const usersRepository = {
  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  },

  findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  findByIdWithMemberships(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: { memberships: { include: { tenant: true } } },
    });
  },
};
