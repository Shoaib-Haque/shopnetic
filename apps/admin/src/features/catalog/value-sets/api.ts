'use client';

import type { ValueSet } from '@shopnetic/contracts';
import { adminApi } from '@/features/admin-api/client';

export function listValueSets(): Promise<ValueSet[]> {
  return adminApi<ValueSet[]>('/value-sets');
}
