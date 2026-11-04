import { z } from 'zod';
import { notFound, validationError } from './errors.js';

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data ?? {});
  if (!r.success) throw validationError(r.error);
  return r.data;
}

/** Invalid UUIDs in the path are treated as missing resources (no enumeration hints). */
export function idParam(value: unknown): string {
  const r = z.uuid().safeParse(value);
  if (!r.success) throw notFound();
  return r.data;
}
