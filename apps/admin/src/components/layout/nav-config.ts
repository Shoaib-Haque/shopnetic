import {
  Boxes,
  FolderTree,
  Image,
  LayoutDashboard,
  ListChecks,
  SlidersHorizontal,
  Tags,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';

/**
 * Left-sidebar navigation. `key` maps to `admin.nav.<key>` in the message
 * catalog. `path` is appended to the app root (`/<locale>/<basePath>`); items
 * with `soon: true` render disabled until their page lands. `superAdminOnly`
 * hides the item for anyone else — the API is still the real enforcement
 * (`@RequirePermission`), this only stops a normal Admin from seeing (and
 * clicking into) a control that would just reject them.
 */
export interface NavItem {
  key: string;
  path?: string;
  icon: LucideIcon;
  soon?: boolean;
  superAdminOnly?: boolean;
}

export interface NavSection {
  key: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    key: 'overview',
    items: [{ key: 'dashboard', path: '', icon: LayoutDashboard }],
  },
  {
    key: 'catalog',
    items: [
      { key: 'categories', path: '/catalog/categories', icon: FolderTree },
      { key: 'brands', icon: Tags, soon: true },
      { key: 'optionTypes', icon: SlidersHorizontal, soon: true },
      { key: 'valueSets', icon: ListChecks, soon: true },
      { key: 'products', icon: Boxes, soon: true },
      { key: 'media', icon: Image, soon: true },
    ],
  },
  {
    key: 'administration',
    items: [{ key: 'staff', path: '/staff', icon: UserPlus, superAdminOnly: true }],
  },
];

/**
 * `NAV_SECTIONS` filtered to what `roles` may see — drops `superAdminOnly`
 * items for anyone without `SUPER_ADMIN`, and drops a section entirely once
 * it has no visible items left (rather than showing an empty heading).
 */
export function visibleNavSections(roles: readonly string[]): NavSection[] {
  const isSuperAdmin = roles.includes('SUPER_ADMIN');
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.superAdminOnly || isSuperAdmin),
  })).filter((section) => section.items.length > 0);
}
