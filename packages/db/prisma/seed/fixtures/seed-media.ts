/**
 * Local seed photos for the fixture catalog's `MediaAsset` rows.
 *
 * There's no S3/MinIO upload pipeline yet (`fileKey` is meant to hold an
 * object-storage key once one exists — see `plan/26-catalog-options-variants-brands.md`
 * section 5), so for now these are real, openly-licensed product photos
 * served as static files from `apps/api/public/seed-media/` (wired in
 * `apps/api/src/main.ts`, dev-only) and referenced by their full URL on the
 * API's origin — not an admin-relative path — so admin, storefront, and
 * seller can all render the same `<img src>` without needing their own copy
 * or a BFF hop. `PRODUCT_API_ORIGIN` below is the dev default
 * (`apps/api/.env.example`'s `PORT=4000`); seeding only ever runs in dev/CI
 * (`resolveProfile` throws under `NODE_ENV=production`), so this isn't
 * meant to be configurable per-environment the way a real app setting would be.
 *
 * **Migrating to the real pipeline later**: upload the files below (or
 * freshly re-fetched originals — see `source_url` for each) to S3/MinIO,
 * then update only the paths in `SEED_PHOTO` to the resulting keys/URLs.
 * `fixtures/inventory.ts` references photos by the category key on the
 * left, never by raw path, so nothing else needs to change.
 *
 * Source: Wikimedia Commons, openly licensed (CC0 / CC BY / CC BY-SA),
 * downloaded and re-encoded (resized, re-compressed, stripped of metadata)
 * by `fetch.py` (one-off dev tooling, not part of the app). Per-photo
 * attribution:
 * - headphones: "Headphone-dynamic-clay.png" (CC0)
 * - laptop: "2006 broken laptop computer 237398638.jpg" (CC BY 2.0)
 * - speaker: "JBL GO2 Bluetooth speaker..." (CC BY-SA 4.0)
 * - tshirt: "PC Liao wearing Hatsune Miku T-shirt..." (CC BY-SA 4.0)
 * - jeans: "Woman in denim jeans in Paris 2007.jpg" (CC BY 2.0)
 * - dress: "\"Summer Dress\".jpg" (CC BY-SA 4.0)
 * - shoes: "Nike running sneakers 2013-10-06 08-34.jpg" (CC BY-SA 3.0)
 * - cookware: "Out of the Frying Pan - Flickr - docoverachiever.jpg" (CC BY 2.0)
 * - blender: "Pink portable blender.jpg" (CC BY-SA 4.0)
 * - dumbbell: "A close-up view of a set of heavy dumbbells.jpg" (CC BY 2.0)
 * - tent: "Camping tents at the 06-29 exhibition..." (CC BY-SA 4.0)
 * - backpack: "School bag backpack.jpg" (CC BY-SA 3.0)
 * - phone: "Smartphone di varie marche.png" (CC BY-SA 4.0)
 * - gadget: "My New Gadget -~).jpg" (CC BY 2.0)
 */
const API_ORIGIN = 'http://localhost:4000';
const photo = (file: string): string => `${API_ORIGIN}/seed-media/${file}`;

export const SEED_PHOTO = {
  headphones: photo('headphones.jpg'),
  laptop: photo('laptop.jpg'),
  speaker: photo('speaker.jpg'),
  tshirt: photo('tshirt.jpg'),
  jeans: photo('jeans.jpg'),
  dress: photo('dress.jpg'),
  shoes: photo('shoes.jpg'),
  cookware: photo('cookware.jpg'),
  blender: photo('blender.jpg'),
  dumbbell: photo('dumbbell.jpg'),
  tent: photo('tent.jpg'),
  backpack: photo('backpack.jpg'),
  phone: photo('phone.jpg'),
  gadget: photo('gadget.jpg'),
} as const;

export type SeedPhotoKey = keyof typeof SEED_PHOTO;
