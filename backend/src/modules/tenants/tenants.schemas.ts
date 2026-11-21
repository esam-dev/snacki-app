import { z } from 'zod';

export const createTenantSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug inválido').optional(),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;