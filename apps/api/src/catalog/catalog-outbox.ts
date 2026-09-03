import type { Prisma } from '@shopnetic/db';

/** Write a `catalog.outbox` row inside the same transaction as the mutation. */
export async function writeCatalogOutbox(
  tx: Prisma.TransactionClient,
  aggregateType: string,
  eventType: string,
  aggregateId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await tx.catalogOutbox.create({
    data: { aggregateType, aggregateId, eventType, payload: payload as Prisma.InputJsonValue },
  });
}
