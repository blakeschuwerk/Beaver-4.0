import { randomUUID } from 'node:crypto';
import { SCHEMA_VERSION } from './constants.js';
import type { BaseMessage } from './messages.js';

/** Create base message fields for a new Pub/Sub message */
export function createBaseMessage(traceId?: string): BaseMessage {
  return {
    schema_version: SCHEMA_VERSION,
    trace_id: traceId ?? randomUUID(),
    published_at: new Date().toISOString(),
  };
}

/** Stable job ID for idempotent dispatcher publishes */
export function createJobId(countyId: string, dateStr?: string): string {
  const date = dateStr ?? new Date().toISOString().slice(0, 10);
  return `job-${countyId}-${date}`;
}

/** Stable document ID from content hash */
export function createDocumentId(countyId: string, contentHash: string): string {
  return `doc-${countyId}-${contentHash.slice(0, 16)}`;
}

/** Stable project ID — prefer tracking_number when available */
export function createProjectId(countyId: string, trackingNumber?: string, chunkId?: string): string {
  if (trackingNumber) {
    return `proj-${countyId}-${trackingNumber}`;
  }
  return `proj-${countyId}-${chunkId ?? randomUUID().slice(0, 8)}`;
}
