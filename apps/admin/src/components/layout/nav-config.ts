import {
  Boxes,
  FolderTree,
  History,
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
 * clicking into) a control that would just reject them. `children` makes the
 * item an expand/collapse group instead of a link — one level only, a child
 * is always a plain link (no nested groups, no `soon`/`superAdminOnly` of its
 * own; gating lives on the parent since every child shares one permission
 * today). Collapsed sidebar: a group's icon links straight to its first
 * child instead of trying to show a flyout submenu.
 */
export interface NavChildItem {
  key: string;
  path: string;
}

export interface NavItem {
  key: string;
  path?: string;
  icon: LucideIcon;
  soon?: boolean;
  superAdminOnly?: boolean;
  children?: NavChildItem[];
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
      { key: 'brands', path: '/catalog/brands', icon: Tags },
      { key: 'optionTypes', icon: SlidersHorizontal, soon: true },
      { key: 'valueSets', icon: ListChecks, soon: true },
      { key: 'products', icon: Boxes, soon: true },
      { key: 'media', icon: Image, soon: true },
    ],
  },
  {
    key: 'administration',
    items: [
      {
        key: 'staff',
        icon: UserPlus,
        superAdminOnly: true,
        children: [
          { key: 'staffList', path: '/staff' },
          { key: 'staffInvite', path: '/staff/invite' },
        ],
      },
      // not superAdminOnly: Service Admin and Admin both hold `auditlog:read`
      // too (plan/03 section 4), just "partial" vs Super Admin's "full" — the
      // API scopes rows down for partial (hides staff:manage-gated events),
      // so this nav link is the same for everyone even though the feed
      // itself isn't.
      { key: 'auditLog', path: '/audit-log', icon: History },
    ],
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
