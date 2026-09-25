/**
 * Option-type / value-set fixtures — a type with 25 values (scroll), a
 * single-value type, the non-`select` data types, a deprecated type, a
 * large and a tiny value set, plus a bulk batch (`MANY_ATTRIBUTES`, ~65
 * types) and an expanded `color` (demo's 5 + ~33 more, 38 total) so the
 * admin Option Types list has 70+ rows and at least one value-heavy type to
 * exercise loading/scroll and modal-height UI against. Dev / CI only.
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

/** demo's 5 (same codes/hexes — an upsert here must not perturb them) + ~33
 * more, so `color` alone comfortably clears "30+ values" for a modal-height
 * check. */
const COLORS: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  blue: '#1e3a8a',
  red: '#dc2626',
  green: '#16a34a',
  gray: '#6b7280',
  silver: '#c0c0c0',
  gold: '#d4af37',
  'rose-gold': '#b76e79',
  navy: '#1e293b',
  teal: '#0d9488',
  purple: '#7c3aed',
  pink: '#ec4899',
  orange: '#f97316',
  yellow: '#eab308',
  brown: '#78350f',
  beige: '#d6cbb0',
  cream: '#fffdd0',
  maroon: '#7f1d1d',
  olive: '#556b2f',
  mint: '#98ff98',
  turquoise: '#40e0d0',
  lavender: '#b57edc',
  coral: '#ff7f50',
  burgundy: '#800020',
  charcoal: '#36454f',
  ivory: '#fffff0',
  tan: '#d2b48c',
  khaki: '#c3b091',
  indigo: '#4b0082',
  magenta: '#ff00ff',
  lime: '#a3e635',
  peach: '#ffdab9',
  'sky-blue': '#87ceeb',
  graphite: '#383838',
  'midnight-blue': '#191970',
  'forest-green': '#228b22',
  crimson: '#dc143c',
};

/** A wide batch of realistic, cross-category product attributes — most
 * `select` with a handful of plausible values, a few `number`/`text`/`bool`
 * for data-type variety (matching the pattern `fx-length`/`fx-care`/
 * `fx-waterproof` already set below). Purely for volume/UI-stress; the
 * values themselves aren't referenced by any product fixture. */
const MANY_ATTRIBUTES: Array<{
  name: string;
  dataType?: 'select' | 'text' | 'number' | 'bool' | 'swatch';
  values?: string[];
}> = [
  // Electronics
  { name: 'Screen Size', values: ['13 inch', '14 inch', '15 inch', '16 inch', '17 inch'] },
  { name: 'Battery Capacity', dataType: 'number' },
  { name: 'Processor', values: ['i3', 'i5', 'i7', 'i9', 'Ryzen 5', 'Ryzen 7'] },
  { name: 'Operating System', values: ['Windows', 'macOS', 'Linux', 'ChromeOS'] },
  { name: 'Connector Type', values: ['USB-C', 'USB-A', 'Lightning', 'HDMI', 'Micro-USB'] },
  { name: 'Bluetooth Version', values: ['4.0', '4.2', '5.0', '5.1', '5.2', '5.3'] },
  { name: 'Wifi Standard', values: ['802.11n', '802.11ac', 'Wi-Fi 6', 'Wi-Fi 6E'] },
  { name: 'Camera Resolution', values: ['8MP', '12MP', '48MP', '108MP', '200MP'] },
  { name: 'Refresh Rate', values: ['60Hz', '90Hz', '120Hz', '144Hz', '165Hz', '240Hz'] },
  { name: 'Screen Resolution', values: ['HD', 'Full HD', '2K', '4K', '8K'] },
  { name: 'Water Resistance Rating', values: ['IPX4', 'IPX5', 'IPX7', 'IPX8', 'IP68'] },
  { name: 'Microphone Type', values: ['Omnidirectional', 'Cardioid', 'Condenser', 'Dynamic'] },
  { name: 'Impedance', dataType: 'number' },
  { name: 'Frequency Response', dataType: 'text' },
  { name: 'Port Type', values: ['Type A', 'Type B', 'Type C', 'Micro'] },
  // Apparel
  { name: 'Sleeve Length', values: ['Sleeveless', 'Short Sleeve', '3/4 Sleeve', 'Long Sleeve'] },
  { name: 'Neckline', values: ['Crew Neck', 'V-Neck', 'Turtleneck', 'Scoop Neck', 'Boat Neck'] },
  { name: 'Fit Type', values: ['Slim', 'Regular', 'Relaxed', 'Oversized'] },
  { name: 'Pattern', values: ['Solid', 'Striped', 'Plaid', 'Floral', 'Polka Dot', 'Camouflage'] },
  { name: 'Closure Type', values: ['Zipper', 'Button', 'Snap', 'Velcro', 'Drawstring'] },
  { name: 'Fabric Weight', values: ['Lightweight', 'Midweight', 'Heavyweight'] },
  { name: 'Thread Count', dataType: 'number' },
  { name: 'Season', values: ['Spring', 'Summer', 'Fall', 'Winter', 'All Season'] },
  { name: 'Occasion', values: ['Casual', 'Formal', 'Business', 'Sport', 'Party'] },
  { name: 'Gender', values: ['Men', 'Women', 'Unisex', 'Kids'] },
  { name: 'Age Group', values: ['Infant', 'Toddler', 'Kids', 'Teen', 'Adult'] },
  { name: 'Style', values: ['Classic', 'Modern', 'Vintage', 'Bohemian', 'Minimalist'] },
  // Home & Kitchen
  { name: 'Capacity (L)', values: ['0.5L', '1L', '1.5L', '2L', '3L', '5L'] },
  { name: 'Wattage', dataType: 'number' },
  { name: 'Voltage Rating', values: ['110V', '220V', '120-240V'] },
  { name: 'Energy Rating', values: ['A+++', 'A++', 'A+', 'A', 'B', 'C'] },
  { name: 'Noise Level', values: ['Quiet', 'Standard', 'Loud'] },
  { name: 'Filter Type', values: ['HEPA', 'Carbon', 'Mesh', 'Paper'] },
  { name: 'Automatic Shutoff', dataType: 'bool' },
  { name: 'Timer', dataType: 'bool' },
  { name: 'Child Lock', dataType: 'bool' },
  { name: 'Dishwasher Safe', dataType: 'bool' },
  { name: 'Microwave Safe', dataType: 'bool' },
  { name: 'Non-Stick Coating', dataType: 'bool' },
  // Sports & Outdoors
  { name: 'Weight Capacity', values: ['100kg', '150kg', '200kg', '250kg'] },
  { name: 'Resistance Level', values: ['Low', 'Medium', 'High', 'Adjustable'] },
  { name: 'Grip Type', values: ['Foam', 'Rubber', 'Leather', 'Cushioned'] },
  { name: 'Sole Type', values: ['Rubber', 'EVA', 'Gel', 'Air'] },
  { name: 'Terrain Type', values: ['Road', 'Trail', 'Track', 'Indoor'] },
  { name: 'Insulation Type', values: ['Down', 'Synthetic', 'Fleece', 'None'] },
  { name: 'Waterproof Rating', values: ['Not Waterproof', 'Water Resistant', 'Waterproof'] },
  { name: 'Frame Material', values: ['Aluminum', 'Carbon Fiber', 'Steel', 'Titanium'] },
  // Beauty
  { name: 'Skin Type', values: ['Dry', 'Oily', 'Combination', 'Sensitive', 'Normal'] },
  { name: 'Fragrance', values: ['Unscented', 'Floral', 'Citrus', 'Woody', 'Fresh'] },
  { name: 'SPF Rating', values: ['SPF15', 'SPF30', 'SPF50', 'SPF50+'] },
  { name: 'Volume (mL)', values: ['30mL', '50mL', '100mL', '200mL', '500mL'] },
  { name: 'Hair Type', values: ['Straight', 'Wavy', 'Curly', 'Coily'] },
  { name: 'Finish', values: ['Matte', 'Glossy', 'Satin', 'Shimmer'] },
  { name: 'Cruelty Free', dataType: 'bool' },
  { name: 'Organic', dataType: 'bool' },
  // Automotive
  { name: 'Fuel Type', values: ['Petrol', 'Diesel', 'Electric', 'Hybrid'] },
  { name: 'Tire Size', values: ['15 inch', '16 inch', '17 inch', '18 inch', '19 inch'] },
  { name: 'Vehicle Type', values: ['Sedan', 'SUV', 'Truck', 'Hatchback', 'Coupe'] },
  { name: 'Transmission', values: ['Manual', 'Automatic', 'CVT'] },
  { name: 'Drive Type', values: ['FWD', 'RWD', 'AWD', '4WD'] },
  { name: 'Engine Capacity', dataType: 'text' },
  // Furniture & Office
  { name: 'Seating Capacity', values: ['1', '2', '3', '4', '5+'] },
  { name: 'Assembly Required', dataType: 'bool' },
  { name: 'Weight Limit', values: ['100kg', '150kg', '200kg'] },
  { name: 'Adjustable Height', dataType: 'bool' },
  {
    name: 'Mounting Type',
    values: ['Wall Mount', 'Floor Standing', 'Desk Mount', 'Ceiling Mount'],
  },
  { name: 'Cable Length', values: ['1m', '1.5m', '2m', '3m', '5m'] },
];

/** Lowercase kebab-case, matching `optionCodeSchema` (`^[a-z0-9]+(?:[-_][a-z0-9]+)*$`). */
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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

  // re-upserts demo's `color` with the full 38-value list — additive-only
  // (`25` section 1.1), the original 5 codes/hexes are unchanged.
  await upsertOptionType(prisma, ctx, {
    code: 'color',
    name: 'Color',
    dataType: 'swatch',
    hasSwatch: true,
    values: Object.entries(COLORS).map(([code, swatchHex]) => ({
      code,
      label: code
        .split('-')
        .map((w) => w[0]!.toUpperCase() + w.slice(1))
        .join(' '),
      swatchHex,
    })),
  });

  for (const attr of MANY_ATTRIBUTES) {
    await upsertOptionType(prisma, ctx, {
      code: `fx-${slug(attr.name)}`,
      name: attr.name,
      dataType: attr.dataType ?? 'select',
      ...(attr.values ? { values: attr.values.map((v) => ({ code: slug(v), label: v })) } : {}),
    });
  }

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
