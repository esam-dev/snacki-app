import { z } from 'zod';

const CATEGORIES = ['helado', 'comida_rapida', 'pizza', 'cafe', 'otro'] as const;

/**
 * Registro. Un comercio puede ser:
 * - `new`: local nuevo (el usuario queda como titular y se crea el comercio con `tenantName`).
 * - `branch`: sucursal de un local existente (`tenantId`); el usuario queda como asistente y sus cambios
 *   de promos y recompensas requieren aprobación de un titular.
 * Sin `businessMode`, un `tenantId` implica sucursal y su ausencia, local nuevo.
 */
export const registerSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().transform((v) => v.toLowerCase()),
  password: z.string().min(8).max(128),
  accountType: z.enum(['cliente', 'comercio']),
  businessMode: z.enum(['new', 'branch']).optional(),
  tenantId: z.string().uuid().nullable().optional(),
  tenantName: z.string().trim().min(1).max(120).optional(),
  category: z.enum(CATEGORIES).optional(),
}).superRefine((d, ctx) => {
  if (d.accountType !== 'comercio') return;
  const mode = d.businessMode ?? (d.tenantId ? 'branch' : 'new');
  if (mode === 'branch' && !d.tenantId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tenantId'], message: 'Elige el comercio al que pertenece la sucursal' });
  if (mode === 'new' && !d.tenantName) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tenantName'], message: 'El nombre del local es requerido' });
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
  accountType: z.enum(['cliente', 'comercio']),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;