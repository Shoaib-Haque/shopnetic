/**
 * Option-type / value-set fixtures — a type with 25 values (scroll), a
 * single-value type, the non-`select` data types, a deprecated type, plus a
 * large and a tiny value set. Dev / CI only.
 */
import type { PrismaClient } from '../../../../src/index.js';
import type { SeedCtx } from '../../ctx.js';
import { upsertOptionType, upsertValueSet } from '../../factories.js';

const MATERIALS = [
  'cotton',
  'linen',
  'wool',
  'silk',
  'polyester',
  'nylon',
  'denim',
  'leather',
  'suede',
  'canvas',
  'cashmere',
  'velvet',
  'corduroy',
  'fleece',
  'bamboo',
  'hemp',
  'rayon',
  'spandex',
  'acrylic',
  'tweed',
  'chiffon',
  'satin',
  'jersey',
  'flannel',
  'microfiber',
];

export async function seedFixtureOptions(prisma: PrismaClient, ctx: SeedCtx): Promise<void> {
  await upsertOptionType(prisma, ctx, {
    code: 'fx-material',
    name: 'Material',
    values: MATERIALS.map((m) => ({ code: m, label: m[0]!.toUpperCase() + m.slice(1) })),
  });
  await upsertOptionType(prisma, ctx, {
    code: 'fx-single',
    name: 'One-Off',
    values: [{ code: 'only', label: 'Only option' }],
  });
  await upsertOptionType(prisma, ctx, {
    code: 'fx-length',
    name: 'Length (cm)',
    dataType: 'number',
  });
  await upsertOptionType(prisma, ctx, { code: 'fx-care', name: 'Care Notes', dataType: 'text' });
  await upsertOptionType(prisma, ctx, {
    code: 'fx-waterproof',
    name: 'Waterproof',
    dataType: 'bool',
  });
  await upsertOptionType(prisma, ctx, {
    code: 'fx-deprecated',
    name: 'Legacy Finish',
    status: 'deprecated',
    values: [
      { code: 'matte', label: 'Matte' },
      { code: 'gloss', label: 'Gloss' },
    ],
  });

  await upsertValueSet(prisma, ctx, {
    name: 'All materials',
    values: MATERIALS.map((valueCode) => ({ typeCode: 'fx-material', valueCode })),
  });
  await upsertValueSet(prisma, ctx, {
    name: 'Natural fibres only',
    values: (['cotton', 'linen', 'wool', 'silk'] as const).map((valueCode) => ({
      typeCode: 'fx-material',
      valueCode,
    })),
  });
}
