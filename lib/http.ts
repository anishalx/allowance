import { ZodError, prettifyError } from 'zod';
import { PayPalError } from './paypal/client';

export function errorResponse(err: unknown) {
  if (err instanceof ZodError) return Response.json({ error: prettifyError(err) }, { status: 400 });
  if (err instanceof PayPalError) return Response.json({ error: err.message, issue: err.issue, debugId: err.debugId }, { status: 502 });
  console.error(err);
  return Response.json({ error: (err as Error).message ?? 'Unexpected error' }, { status: 500 });
}

export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      return errorResponse(err);
    }
  };
}
