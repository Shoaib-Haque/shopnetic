import { describe, expect, it } from 'vitest';
import { visibleNavSections } from './nav-config';

describe('visibleNavSections', () => {
  it('a Super Admin sees the administration section with staff and the audit log', () => {
    const sections = visibleNavSections(['SUPER_ADMIN']);
    const admin = sections.find((s) => s.key === 'administration');
    expect(admin?.items.map((i) => i.key)).toEqual(['staff', 'auditLog']);
  });

  it('a normal Admin still sees the administration section (audit log isn’t gated), just not Staff', () => {
    const sections = visibleNavSections(['ADMIN']);
    const admin = sections.find((s) => s.key === 'administration');
    expect(admin?.items.map((i) => i.key)).toEqual(['auditLog']);
  });

  it('a multi-role account counts as Super Admin if SUPER_ADMIN is one of the roles', () => {
    const sections = visibleNavSections(['ADMIN', 'SUPER_ADMIN']);
    const admin = sections.find((s) => s.key === 'administration');
    expect(admin?.items.map((i) => i.key)).toContain('staff');
  });

  it('no roles at all still shows the non-gated audit log item, just not staff', () => {
    const admin = visibleNavSections([]).find((s) => s.key === 'administration');
    expect(admin?.items.map((i) => i.key)).toEqual(['auditLog']);
  });

  it('sections with no superAdminOnly items are never filtered', () => {
    const sections = visibleNavSections([]);
    expect(sections.find((s) => s.key === 'overview')).toBeDefined();
    expect(sections.find((s) => s.key === 'catalog')).toBeDefined();
  });
});
