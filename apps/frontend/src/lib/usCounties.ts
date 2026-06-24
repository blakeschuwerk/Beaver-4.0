/**
 * Browser-safe US county lookup — mirrors @beaver/shared/us-counties for the frontend bundle.
 * Data is loaded from the shared JSON via Vite JSON import.
 */
import locationsByState from '@beaver/shared-data/us_locations.json';

export interface ParsedUSCounty {
  name: string;
  state: string;
  label: string;
}

const countyList: string[] = Object.values(locationsByState as Record<string, string[]>)
  .flat()
  .sort((a, b) => a.localeCompare(b));

const countySet = new Set(countyList);

export function flattenUSCounties(): string[] {
  return [...countyList];
}

export function isValidUSCounty(label: string): boolean {
  return countySet.has(label.trim());
}

export function parseUSCountyLabel(label: string): ParsedUSCounty | null {
  const trimmed = label.trim();
  const match = trimmed.match(/^(.+),\s*([A-Z]{2})$/);
  if (!match) return null;
  return {
    name: match[1].trim(),
    state: match[2],
    label: trimmed,
  };
}

function normalizeForSearch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ');
}

export function searchUSCounties(query: string, limit = 8): string[] {
  const q = normalizeForSearch(query.trim());
  if (!q) return [];

  const prefix: string[] = [];
  const substring: string[] = [];

  for (const county of countyList) {
    const normalized = normalizeForSearch(county);
    if (normalized.startsWith(q)) {
      prefix.push(county);
    } else if (normalized.includes(q)) {
      substring.push(county);
    }
    if (prefix.length + substring.length >= limit * 2) break;
  }

  return [...prefix, ...substring].slice(0, limit);
}
