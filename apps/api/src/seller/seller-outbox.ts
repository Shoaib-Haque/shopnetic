import type { Prisma } from '@shopnetic/db';

/** Write a `seller.outbox` row inside the same transaction as the mutation. */
export async function writeSellerOutbox(
  tx: Prisma.TransactionClient,
  aggregateType: string,
  eventType: string,
  aggregateId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await tx.sellerOutbox.create({
    data: { aggregateType, aggregateId, eventType, payload: payload as Prisma.InputJsonValue },
  });
}
