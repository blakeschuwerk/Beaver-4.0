/** Canonical backend project stages — must match packages/shared/src/constants.ts */
export const PROJECT_STAGES = [
  'subcommittee',
  'approved',
  'bidding',
  'awarded',
  'closed',
] as const;

export type ProjectStage = (typeof PROJECT_STAGES)[number];

export const STAGE_DISPLAY_LABELS: Record<ProjectStage, string> = {
  subcommittee: 'Early Planning',
  approved: 'Approved',
  bidding: 'Out for Bid',
  awarded: 'Awarded',
  closed: 'Closed',
};
