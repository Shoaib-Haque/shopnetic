/**
 * Domain event names + payload types shared across bounded contexts
 * (plan/02-architecture.md §4). Producers write these to their outbox; consumers
 * subscribe. Names are `context.thing_happened`, past tense.
 *
 * STUB — populated as contexts are built. Payload schemas will move to Zod in
 * @shopnetic/contracts and be validated on publish + consume.
 */
export const DomainEvent = {
  // identity
  ACCOUNT_REGISTERED: 'identity.account_registered',
  ACCOUNT_ANONYMIZED: 'identity.account_anonymized',
  // catalog
  CATEGORY_CREATED: 'catalog.category_created',
  CATEGORY_UPDATED: 'catalog.category_updated',
  CATEGORY_MOVED: 'catalog.category_moved',
  CATEGORY_DELETED: 'catalog.category_deleted',
  PRODUCT_APPROVED: 'catalog.product_approved',
  PRODUCT_ARCHIVED: 'catalog.product_archived',
  // inventory
  OFFER_PRICE_CHANGED: 'inventory.offer_price_changed',
  OFFER_STOCK_CHANGED: 'inventory.offer_stock_changed',
  // orders
  ORDER_PLACED: 'orders.order_placed',
  SUBORDER_SHIPPED: 'orders.suborder_shipped',
} as const;

export type DomainEvent = (typeof DomainEvent)[keyof typeof DomainEvent];

export interface EventEnvelope<TPayload = unknown> {
  id: string;
  name: DomainEvent;
  occurredAt: string;
  correlationId: string;
  payload: TPayload;
}
