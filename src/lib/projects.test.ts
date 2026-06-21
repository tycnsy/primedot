import { describe, expect, it } from 'vitest';
import { childCountByParent, childrenOf, parentIdsWithChildren, parentItems } from './parentChild';
import { paceEligibleProjects, resolvedProjectTagSeries } from './projects';
import type { Project } from './types';

function project(
  id: string,
  parentId: string | null = null,
  sortOrder = 0,
): Project {
  return {
    id,
    user_id: 'u1',
    name: id,
    video_length: 0,
    due_date: null,
    sync_true_deadline_with_due_date: true,
    buffer_modifier: 1,
    tag: null,
    series: null,
    notes: null,
    sort_order: sortOrder,
    created_at: '2026-01-01T00:00:00.000Z',
    start_date: '2026-01-01T05:00:00.000Z',
    archived_at: null,
    pace_hidden: false,
    parent_id: parentId,
  };
}

describe('parentChild helpers', () => {
  const items = [
    project('parent-a'),
    project('parent-b'),
    project('child-a1', 'parent-a', 1),
    project('child-a2', 'parent-a', 0),
  ];

  it('filters parent items', () => {
    expect(parentItems(items).map((p) => p.id)).toEqual(['parent-a', 'parent-b']);
  });

  it('returns sorted children', () => {
    expect(childrenOf(items, 'parent-a').map((p) => p.id)).toEqual([
      'child-a2',
      'child-a1',
    ]);
  });

  it('tracks parents with children', () => {
    expect([...parentIdsWithChildren(items)]).toEqual(['parent-a']);
  });

  it('counts children per parent', () => {
    expect(childCountByParent(items).get('parent-a')).toBe(2);
  });
});

describe('paceEligibleProjects', () => {
  it('includes parents without children and all subprojects', () => {
    const projects = [
      project('parent-a'),
      project('parent-b'),
      project('child-a1', 'parent-a'),
    ];
    expect(paceEligibleProjects(projects).map((p) => p.id).sort()).toEqual([
      'child-a1',
      'parent-b',
    ]);
  });

  it('includes all projects when none have children', () => {
    const projects = [project('parent-a'), project('parent-b')];
    expect(paceEligibleProjects(projects).map((p) => p.id)).toEqual([
      'parent-a',
      'parent-b',
    ]);
  });
});

describe('resolvedProjectTagSeries', () => {
  it('uses parent tag and series for subprojects', () => {
    const sub = project('child', 'parent-a');
    sub.tag = 'old-tag';
    sub.series = 'old-series';
    const parent = project('parent-a');
    parent.tag = 'parent-tag';
    parent.series = 'parent-series';
    expect(resolvedProjectTagSeries(sub, parent)).toEqual({
      tag: 'parent-tag',
      series: 'parent-series',
    });
  });
});
