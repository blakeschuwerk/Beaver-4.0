import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterUsersByNiche,
  geographyOverlap,
  nicheOverlap,
} from './personalization.js';
import type { ProjectCreatedMessage, UserProfile } from '@beaver/shared';

const baseProject: ProjectCreatedMessage = {
  schema_version: '1.0.0',
  trace_id: '00000000-0000-4000-8000-000000000001',
  published_at: '2026-06-22T00:00:00.000Z',
  project_id: 'proj-test-county-2024-042',
  county_id: 'test-county',
  niche_tags: ['roadway', 'drainage'],
  stage: 'subcommittee',
  document_id: 'doc-test-1',
  chunk_ids: ['doc-test-1-child-0'],
};

const matchingUser: UserProfile = {
  user_id: 'user-1',
  company: 'Test Co',
  service_categories: ['roadway', 'civil'],
  geography: ['test-county'],
};

const nonMatchingUser: UserProfile = {
  user_id: 'user-2',
  company: 'Other Co',
  service_categories: ['hvac'],
  geography: ['other-county'],
};

describe('nicheOverlap', () => {
  it('detects category overlap', () => {
    assert.equal(nicheOverlap(['roadway'], ['roadway', 'drainage']), true);
    assert.equal(nicheOverlap(['hvac'], ['roadway']), false);
  });
});

describe('geographyOverlap', () => {
  it('matches exact county_id', () => {
    assert.equal(geographyOverlap(['test-county'], 'test-county'), true);
  });

  it('matches state when provided', () => {
    assert.equal(geographyOverlap(['CA'], 'some-county', 'CA'), true);
  });

  it('does not match arbitrary short strings', () => {
    assert.equal(geographyOverlap(['CA'], 'other-county'), false);
  });

  it('matches canonical US county label against county_id', () => {
    assert.equal(geographyOverlap(['Nash County, NC'], 'nc-nashcounty', 'NC', 'Nash County'), true);
  });

  it('matches canonical label with inferred county metadata', () => {
    assert.equal(geographyOverlap(['Nash County, NC'], 'nc-nashcounty'), true);
  });
});

describe('filterUsersByNiche', () => {
  it('returns users with both category and geography overlap', () => {
    const filtered = filterUsersByNiche([matchingUser, nonMatchingUser], baseProject);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.user_id, 'user-1');
  });

  it('excludes users with only category overlap', () => {
    const categoryOnly: UserProfile = {
      ...matchingUser,
      user_id: 'user-3',
      geography: ['other-county'],
    };
    const filtered = filterUsersByNiche([categoryOnly], baseProject);
    assert.equal(filtered.length, 0);
  });
});
