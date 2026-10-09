import type { Prisma } from '@shopnetic/db';

/** Write an `inventory.outbox` row inside the same transaction as the mutation. */
export async function writeInventoryOutbox(
  tx: Prisma.TransactionClient,
  aggregateType: string,
  eventType: string,
  aggregateId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await tx.inventoryOutbox.create({
    data: { aggregateType, aggregateId, eventType, payload: payload as Prisma.InputJsonValue },
  });
}
