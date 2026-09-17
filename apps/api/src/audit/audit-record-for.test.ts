import { describe, expect, it, vi } from 'vitest';
import type { Actor } from '@shopnetic/auth';
import { auditRecordFor } from './audit-record-for.js';
import type { AuditService } from './audit.service.js';

const actor: Actor = { accountId: 'acc-1', plane: 'staff', grants: [] };

function fakeAudit(): { audit: AuditService; record: ReturnType<typeof vi.fn> } {
  const record = vi.fn().mockResolvedValue(undefined);
  return { audit: { record } as object as AuditService, record };
}

describe('auditRecordFor', () => {
  it('binds targetType and passes actor/action/target through', async () => {
    const { audit, record } = fakeAudit();
    const recordBrand = auditRecordFor(audit, 'brand');

    await recordBrand(actor, 'catalog.brand_created', 'brand-1', {});

    expect(record).toHaveBeenCalledWith({
      actorAccountId: 'acc-1',
      action: 'catalog.brand_created',
      targetType: 'brand',
      targetId: 'brand-1',
      before: undefined,
      after: undefined,
    });
  });

  it('carries before/after/reason through when given', async () => {
    const { audit, record } = fakeAudit();
    const recordCategory = auditRecordFor(audit, 'category');

    await recordCategory(
      actor,
      'catalog.category_deleted',
      'cat-1',
      {},
      {
        before: { status: 'active' },
        reason: 'soft delete',
      },
    );

    expect(record).toHaveBeenCalledWith({
      actorAccountId: 'acc-1',
      action: 'catalog.category_deleted',
      targetType: 'category',
      targetId: 'cat-1',
      before: { status: 'active' },
      after: undefined,
      reason: 'soft delete',
    });
  });

  it('omits ip/correlationId when meta does not carry them, includes them when it does', async () => {
    const { audit, record } = fakeAudit();
    const recordProduct = auditRecordFor(audit, 'product');

    await recordProduct(actor, 'catalog.product_updated', 'prod-1', {
      ip: '1.2.3.4',
      correlationId: 'cid-1',
    });

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ ip: '1.2.3.4', correlationId: 'cid-1' }),
    );
    expect(record.mock.calls[0]![0]).not.toHaveProperty('ip', undefined);
  });

  it('a factory bound to one targetType never leaks into another', async () => {
    const { audit, record } = fakeAudit();
    const recordBrand = auditRecordFor(audit, 'brand');
    const recordVariant = auditRecordFor(audit, 'variant');

    await recordBrand(actor, 'catalog.brand_created', 'brand-1', {});
    await recordVariant(actor, 'catalog.variant_created', 'variant-1', {});

    expect(record.mock.calls[0]![0]).toMatchObject({ targetType: 'brand' });
    expect(record.mock.calls[1]![0]).toMatchObject({ targetType: 'variant' });
  });
});
