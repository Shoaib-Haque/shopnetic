import type { PrismaClient } from '../../../../src/index.js';
import type { SeedCtx, SeedLog } from '../../ctx.js';
import { seedFixtureBrands } from './brands.js';
import { seedFixtureCategories } from './categories.js';
import { seedFixtureOptions } from './options.js';
import { seedFixtureProducts } from './products.js';

export async function seedFixtureCatalog(
  prisma: PrismaClient,
  ctx: SeedCtx,
  log: SeedLog,
): Promise<void> {
  await seedFixtureCategories(prisma, ctx);
  await seedFixtureBrands(prisma, ctx);
  await seedFixtureOptions(prisma, ctx);
  await seedFixtureProducts(prisma, ctx);
  log.info(
    { categories: ctx.category.size, brands: ctx.brand.size, products: ctx.product.size },
    'catalog fixtures seeded',
  );
}
