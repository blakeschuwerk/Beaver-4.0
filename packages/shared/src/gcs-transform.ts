/**
 * Transform GCS OBJECT_FINALIZE Pub/Sub notifications into Beaver message schemas.
 * GCS sends a different envelope than our canonical messages.
 */

export interface GcsObjectNotification {
  bucket?: string;
  name?: string;
  metadata?: Record<string, string>;
}

export function parseGcsNotification(data: unknown): GcsObjectNotification | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  if (typeof obj.name === 'string' && typeof obj.bucket === 'string') {
    return {
      bucket: obj.bucket,
      name: obj.name,
      metadata: obj.metadata as Record<string, string> | undefined,
    };
  }
  return null;
}

/** Build raw-document message fields from GCS notification */
export function gcsToRawDocumentMessage(
  gcs: GcsObjectNotification,
  traceId: string,
): Record<string, unknown> | null {
  if (!gcs.bucket || !gcs.name) return null;

  const parts = gcs.name.split('/');
  const countyId = gcs.metadata?.county_id ?? parts[0] ?? 'unknown';
  const documentId = gcs.metadata?.document_id ?? parts[1] ?? gcs.name.replace(/\//g, '-');

  return {
    schema_version: '1.0.0',
    trace_id: traceId,
    published_at: new Date().toISOString(),
    gcs_uri: `gs://${gcs.bucket}/${gcs.name}`,
    document_id: documentId,
    county_id: countyId,
    content_hash: gcs.metadata?.content_hash ?? 'unknown',
    doc_type: gcs.metadata?.doc_type ?? 'other',
    source_url: gcs.metadata?.source_url,
  };
}

/** Build extracted-chunks message fields from GCS staging notification */
export function gcsToExtractedChunksMessage(
  gcs: GcsObjectNotification,
  traceId: string,
): Record<string, unknown> | null {
  if (!gcs.bucket || !gcs.name) return null;
  if (!gcs.name.endsWith('chunks.json')) return null;

  const parts = gcs.name.split('/');
  const countyId = gcs.metadata?.county_id ?? parts[0] ?? 'unknown';
  const documentId = gcs.metadata?.document_id ?? parts[1] ?? 'unknown';

  return {
    schema_version: '1.0.0',
    trace_id: traceId,
    published_at: new Date().toISOString(),
    gcs_uri: `gs://${gcs.bucket}/${gcs.name}`,
    document_id: documentId,
    county_id: countyId,
    chunk_count: Number(gcs.metadata?.chunk_count ?? 0),
    content_hash: gcs.metadata?.content_hash,
  };
}
