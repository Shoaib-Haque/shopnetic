import { describe, expect, it } from 'vitest';
import { visibleNavSections } from './nav-config';

describe('visibleNavSections', () => {
  it('a Super Admin sees the administration section with the staff item', () => {
    const sections = visibleNavSections(['SUPER_ADMIN']);
    const admin = sections.find((s) => s.key === 'administration');
    expect(admin?.items.map((i) => i.key)).toContain('staff');
  });

  it('a normal Admin has the administration section dropped entirely, not just emptied', () => {
    const sections = visibleNavSections(['ADMIN']);
    expect(sections.find((s) => s.key === 'administration')).toBeUndefined();
  });

  it('a multi-role account counts as Super Admin if SUPER_ADMIN is one of the roles', () => {
    const sections = visibleNavSections(['ADMIN', 'SUPER_ADMIN']);
    expect(sections.find((s) => s.key === 'administration')).toBeDefined();
  });

  it('no roles at all → same as a non-Super-Admin, no administration section', () => {
    expect(visibleNavSections([]).find((s) => s.key === 'administration')).toBeUndefined();
  });

  it('sections with no superAdminOnly items are never filtered', () => {
    const sections = visibleNavSections([]);
    expect(sections.find((s) => s.key === 'overview')).toBeDefined();
    expect(sections.find((s) => s.key === 'catalog')).toBeDefined();
  });
});
