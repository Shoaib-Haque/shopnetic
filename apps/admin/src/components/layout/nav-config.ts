import {
  Boxes,
  FolderTree,
  Image,
  LayoutDashboard,
  ListChecks,
  SlidersHorizontal,
  Tags,
  type LucideIcon,
} from 'lucide-react';

/**
 * Left-sidebar navigation. `key` maps to `admin.nav.<key>` in the message
 * catalog. `path` is appended to the app root (`/<locale>/<basePath>`); items
 * with `soon: true` render disabled until their page lands.
 */
export interface NavItem {
  key: string;
  path?: string;
  icon: LucideIcon;
  soon?: boolean;
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
];
