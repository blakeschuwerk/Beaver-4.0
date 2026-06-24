import { stageLabel, stageStyle } from '../lib/utils';

interface StageBadgeProps {
  stage: string;
  dimmed?: boolean;
}

export function StageBadge({ stage, dimmed }: StageBadgeProps) {
  return (
    <span style={{ ...stageStyle(stage), opacity: dimmed ? 0.6 : 1 }}>
      {stageLabel(stage)}
    </span>
  );
}

interface MatchBadgeProps {
  match: number | null;
}

export function MatchBadge({ match }: MatchBadgeProps) {
  if (match == null) return null;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: '11px',
        fontWeight: 500,
        color: 'var(--accent)',
        background: 'var(--accent-weak)',
        padding: '2px 8px',
        borderRadius: '6px',
      }}
    >
      <span
        style={{
          width: '5px',
          height: '5px',
          borderRadius: '50%',
          background: 'var(--accent)',
        }}
      />
      {match}% match
    </span>
  );
}

interface StageChangeGraphicProps {
  fromStage: string;
  toStage: string;
}

export function StageChangeGraphic({ fromStage, toStage }: StageChangeGraphicProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '7px',
        marginTop: '5px',
        flexWrap: 'wrap',
      }}
    >
      <StageBadge stage={fromStage} dimmed />
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#b6bcc4" strokeWidth="1.6">
        <path d="M5 12h14" strokeLinecap="round" />
        <path d="m13 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <StageBadge stage={toStage} />
    </div>
  );
}
