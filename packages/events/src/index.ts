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
  BRAND_CREATED: 'catalog.brand_created',
  BRAND_UPDATED: 'catalog.brand_updated',
  BRAND_MERGED: 'catalog.brand_merged',
  BRAND_DELETED: 'catalog.brand_deleted',
  OPTION_TYPE_CREATED: 'catalog.option_type_created',
  OPTION_TYPE_UPDATED: 'catalog.option_type_updated',
  OPTION_TYPE_DELETED: 'catalog.option_type_deleted',
  VALUE_SET_CREATED: 'catalog.value_set_created',
  VALUE_SET_UPDATED: 'catalog.value_set_updated',
  VALUE_SET_DELETED: 'catalog.value_set_deleted',
  CATEGORY_OPTION_SET: 'catalog.category_option_set',
  CATEGORY_OPTION_REMOVED: 'catalog.category_option_removed',
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
