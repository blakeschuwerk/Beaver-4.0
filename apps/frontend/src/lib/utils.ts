import type { CSSProperties } from 'react';
import { STAGE_DISPLAY_LABELS, type ProjectStage } from './stages';

const STAGE_STYLES: Record<string, { color: string; background: string }> = {
  subcommittee: { color: '#5b667a', background: '#eef1f5' },
  approved: { color: '#4f46e5', background: '#ecedfd' },
  bidding: { color: '#c2410c', background: '#fcebe1' },
  awarded: { color: '#15803d', background: '#e6f3ea' },
  closed: { color: '#8a93a0', background: '#f1f3f5' },
};

export function stageLabel(stage: string): string {
  return STAGE_DISPLAY_LABELS[stage as ProjectStage] ?? stage;
}

export function stageStyle(stage: string): CSSProperties {
  const s = STAGE_STYLES[stage] ?? STAGE_STYLES.subcommittee;
  return {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: '11.5px',
    fontWeight: 600,
    padding: '3px 9px',
    borderRadius: '6px',
    whiteSpace: 'nowrap',
    color: s.color,
    background: s.background,
  };
}

export function formatBudget(budget: number | null): string {
  if (budget == null) return '—';
  if (budget >= 1_000_000) return `$${(budget / 1_000_000).toFixed(1)}M`;
  if (budget >= 1_000) return `$${Math.round(budget / 1_000)}K`;
  return `$${budget.toLocaleString()}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}
