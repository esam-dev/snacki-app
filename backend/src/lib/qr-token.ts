import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Token del QR de compra (`S1`) y de canje (`R1`), compacto para que el QR sea poco denso y admita el logo al centro:
 *
 *   S1.<claimId sin guiones (32 hex)>.<exp en segundos, base36>.<HMAC-SHA256 truncado a 128 bits, base64url>
 *
 * - Solo identifica el `PurchaseClaim`: puntos, comercio y estado se leen del servidor al canjear,
 *   así que alterar el QR no sirve de nada (y rompe la firma).
 * - La firma usa `QR_SECRET` (distinto del secreto de sesión) e incluye la versión, por lo que un
 *   token de sesión u otro formato nunca pasa como QR.
 * - El "un solo uso" NO depende del token: lo garantiza el canje atómico en base de datos.
 */
const SIG_BYTES = 16;

/** Prefijo del contenido del QR para que el escáner lo distinga de otros códigos. */
export const QR_URI_PREFIX = 'snacki://claim/';
/** QR de canje de recompensa (versión `R1`): una firma de compra nunca vale como canje ni al revés. */
export const REDEEM_URI_PREFIX = 'snacki://redeem/';

export interface QrTokenPayload { claimId: string; exp: number; }

export class QrTokenError extends Error {
  constructor(public reason: 'invalid' | 'expired') {
    super(reason === 'expired' ? 'QR vencido' : 'QR inválido');
  }
}

type Version = 'S1' | 'R1';
const TOKEN_RES: Record<Version, RegExp> = {
  S1: /^S1\.([0-9a-f]{32})\.([0-9a-z]{1,10})\.([A-Za-z0-9_-]{22})$/,
  R1: /^R1\.([0-9a-f]{32})\.([0-9a-z]{1,10})\.([A-Za-z0-9_-]{22})$/,
};

function sign(body: string): Buffer {
  return createHmac('sha256', env.qrSecret).update(body).digest().subarray(0, SIG_BYTES);
}

function signToken(version: Version, id: string, expiresAt: Date): string {
  const hex = id.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error('El id del QR debe ser un UUID');
  const exp = Math.floor(expiresAt.getTime() / 1000).toString(36);
  const body = `${version}.${hex}.${exp}`;
  return `${body}.${sign(body).toString('base64url')}`;
}

function verifyToken(version: Version, prefix: string, input: string, now: number): QrTokenPayload {
  const raw = (input ?? '').trim();
  const token = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
  const m = TOKEN_RES[version].exec(token);
  if (!m) throw new QrTokenError('invalid');

  const [, id, exp36, sig] = m;
  // Se compara el texto base64url (no los bytes decodificados): así el último carácter, que lleva
  // 2 bits de relleno, no admite variantes y cada QR tiene una única representación válida.
  const expected = Buffer.from(sign(`${version}.${id}.${exp36}`).toString('base64url'));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new QrTokenError('invalid');

  const exp = parseInt(exp36, 36);
  if (!Number.isSafeInteger(exp)) throw new QrTokenError('invalid');
  if (exp * 1000 <= now) throw new QrTokenError('expired');

  const claimId = `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
  return { claimId, exp };
}

export function signQrToken(claimId: string, expiresAt: Date): string {
  return signToken('S1', claimId, expiresAt);
}

/** Valida formato, firma (en tiempo constante) y vencimiento de un QR de compra. Lanza `QrTokenError`. */
export function verifyQrToken(input: string, now = Date.now()): QrTokenPayload {
  return verifyToken('S1', QR_URI_PREFIX, input, now);
}

export function signRedeemToken(qrId: string, expiresAt: Date): string {
  return signToken('R1', qrId, expiresAt);
}

/** Igual que `verifyQrToken`, para el QR de canje de recompensa. */
export function verifyRedeemToken(input: string, now = Date.now()): QrTokenPayload {
  return verifyToken('R1', REDEEM_URI_PREFIX, input, now);
}
