export class AppError extends Error {
  constructor(public statusCode: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}