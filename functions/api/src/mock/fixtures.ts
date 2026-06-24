import type {
  CountyConfig,
  MatchRow,
  ProjectRow,
  TrackedProject,
  UserProfile,
} from '@beaver/shared';

export const MOCK_USER: UserProfile = {
  user_id: 'mock-user-001',
  company: 'Demo Civil Contractors',
  service_categories: ['Roadway', 'Drainage', 'Earthwork'],
  geography: ['Nash County, NC'],
  role: 'admin',
  updated_at: new Date().toISOString(),
};

export const MOCK_COUNTIES: CountyConfig[] = [
  {
    county_id: 'nc-nashcounty',
    name: 'Nash County',
    state: 'NC',
    source_urls: ['https://www.nashcountync.gov/AgendaCenter'],
    scraper_strategy: 'civic_scraper',
    platform: 'CivicPlus',
    broken: false,
    failure_count: 0,
  },
  {
    county_id: 'sonoma-county',
    name: 'Sonoma County',
    state: 'CA',
    source_urls: ['https://sonoma-county.granicus.com/ViewPublisher.php?view_id=2'],
    scraper_strategy: 'civic_scraper',
    platform: 'Legistar',
    broken: false,
    failure_count: 0,
  },
];

export const MOCK_PROJECTS: ProjectRow[] = [
  {
    project_id: 'proj-nc-nashcounty-2024-042',
    tracking_number: '2024-042',
    county_id: 'nc-nashcounty',
    project_type: 'Roadway Resurfacing',
    niche_tags: ['roadway', 'drainage', 'civil'],
    estimated_budget: 2_450_000,
    requirements:
      'Resurfacing of approximately 3.2 miles of secondary roads including drainage improvements at four intersections.',
    stage: 'subcommittee',
    location: 'Nashville, NC · Nash County',
    bid_deadline: '2026-09-15T00:00:00.000Z',
    source_document_ids: ['doc-nc-nashcounty-abc123'],
    first_seen_at: '2026-06-20T06:01:31.000Z',
    last_updated_at: '2026-06-24T18:03:59.000Z',
  },
  {
    project_id: 'proj-nc-nashcounty-2024-018',
    tracking_number: '2024-018',
    county_id: 'nc-nashcounty',
    project_type: 'Park Renovation',
    niche_tags: ['concrete', 'drainage', 'structural'],
    estimated_budget: 890_000,
    requirements:
      'Twin Lakes Park renovation including new pavilion, ADA-compliant walkways, and stormwater management upgrades.',
    stage: 'approved',
    location: 'Rocky Mount, NC · Nash County',
    bid_deadline: '2026-08-01T00:00:00.000Z',
    source_document_ids: ['doc-nc-nashcounty-def456'],
    first_seen_at: '2026-06-18T10:00:00.000Z',
    last_updated_at: '2026-06-22T14:30:00.000Z',
  },
  {
    project_id: 'proj-nc-nashcounty-2024-055',
    tracking_number: '2024-055',
    county_id: 'nc-nashcounty',
    project_type: 'Bridge Replacement',
    niche_tags: ['structural', 'concrete', 'earthwork'],
    estimated_budget: 4_200_000,
    requirements:
      'Replacement of County Bridge #14 over Swift Creek including abutment reconstruction and approach roadway work.',
    stage: 'bidding',
    location: 'Bailey, NC · Nash County',
    bid_deadline: '2026-07-20T00:00:00.000Z',
    source_document_ids: ['doc-nc-nashcounty-ghi789'],
    first_seen_at: '2026-06-10T08:00:00.000Z',
    last_updated_at: '2026-06-24T12:00:00.000Z',
  },
];

export const MOCK_MATCHES: MatchRow[] = [
  {
    match_id: 'match-mock-user-001-proj-nc-nashcounty-2024-042',
    user_id: MOCK_USER.user_id,
    project_id: 'proj-nc-nashcounty-2024-042',
    county_id: 'nc-nashcounty',
    relevance_score: 0.87,
    matched_at: '2026-06-24T18:05:00.000Z',
    match_method: 'llm_scored',
  },
  {
    match_id: 'match-mock-user-001-proj-nc-nashcounty-2024-018',
    user_id: MOCK_USER.user_id,
    project_id: 'proj-nc-nashcounty-2024-018',
    county_id: 'nc-nashcounty',
    relevance_score: 0.72,
    matched_at: '2026-06-22T14:35:00.000Z',
    match_method: 'llm_scored',
  },
  {
    match_id: 'match-mock-user-001-proj-nc-nashcounty-2024-055',
    user_id: MOCK_USER.user_id,
    project_id: 'proj-nc-nashcounty-2024-055',
    county_id: 'nc-nashcounty',
    relevance_score: 0.65,
    matched_at: '2026-06-24T12:05:00.000Z',
    match_method: 'llm_scored',
  },
];

export const MOCK_RATIONALES: Record<string, string> = {
  'proj-nc-nashcounty-2024-042':
    'Strong overlap with your Roadway and Drainage service categories in Nash County. Early planning stage with substantial budget.',
  'proj-nc-nashcounty-2024-018':
    'Concrete and drainage work aligns with your profile. Approved stage — budget and scope are defined.',
  'proj-nc-nashcounty-2024-055':
    'Structural and earthwork categories match. Project is out for bid with a near-term deadline.',
};

export const MOCK_TRACKS: TrackedProject[] = [
  {
    user_id: MOCK_USER.user_id,
    project_id: 'proj-nc-nashcounty-2024-018',
    tracked_at: '2026-06-20T10:00:00.000Z',
    last_viewed_stage: 'subcommittee',
  },
];

export const MOCK_STAGE_UPDATES = [
  {
    project_id: 'proj-nc-nashcounty-2024-018',
    from_stage: 'subcommittee' as const,
    to_stage: 'approved' as const,
    changed_at: '2026-06-22T14:30:00.000Z',
  },
];
