import { randomUUID } from 'node:crypto';
import {
  BQ_DATASET,
  BQ_TABLE_PROJECTS,
  BQ_TABLE_PROJECT_CHUNKS,
  TOPIC_PROJECTS_CREATED,
  createBaseMessage,
  createProjectId,
  projectCreatedSchema,
  type ProjectRow,
} from '@beaver/shared';
import { BigQuery } from '@google-cloud/bigquery';
import { PubSub } from '@google-cloud/pubsub';
import { Storage } from '@google-cloud/storage';
import { classifyChunk, type ClassificationResult } from './llm-client.js';

const MOCK_MODE = process.env.MOCK_MODE === 'true';

export interface ChunkRecord {
  chunk_id: string;
  parent_chunk_id?: string;
  text: string;
  chunk_type?: string;
}

export interface StagingDocument {
  document_id: string;
  county_id: string;
  trace_id?: string;
  chunks: ChunkRecord[];
  content_hash?: string;
}

export async function loadStagingDocument(gcsUri: string): Promise<StagingDocument> {
  if (MOCK_MODE) {
    return {
      document_id: 'doc-demo-county-mockhash1234',
      county_id: 'demo-county',
      trace_id: randomUUID(),
      chunks: [
        {
          chunk_id: 'doc-demo-county-mockhash1234-child-0',
          text: 'CIP-2024-042 roadway resurfacing budget $2.5M subcommittee agenda drainage improvements',
        },
      ],
    };
  }

  const parts = gcsUri.replace('gs://', '').split('/');
  const bucketName = parts[0];
  const blobPath = parts.slice(1).join('/');

  const storage = new Storage();
  const [contents] = await storage.bucket(bucketName).file(blobPath).download();
  return JSON.parse(contents.toString()) as StagingDocument;
}

export async function mergeUpsertProject(
  bigquery: BigQuery,
  project: Partial<ProjectRow> & { project_id: string; county_id: string },
): Promise<void> {
  if (MOCK_MODE) {
    console.log('[MOCK] MERGE project:', project);
    return;
  }

  const now = new Date().toISOString();
  const query = `
    MERGE \`${process.env.GCP_PROJECT_ID}.${BQ_DATASET}.${BQ_TABLE_PROJECTS}\` T
    USING (SELECT @project_id AS project_id) S
    ON T.project_id = S.project_id
    WHEN MATCHED THEN UPDATE SET
      tracking_number = COALESCE(@tracking_number, T.tracking_number),
      project_type = COALESCE(@project_type, T.project_type),
      niche_tags = @niche_tags,
      estimated_budget = COALESCE(@estimated_budget, T.estimated_budget),
      requirements = COALESCE(@requirements, T.requirements),
      stage = @stage,
      location = COALESCE(@location, T.location),
      bid_deadline = COALESCE(@bid_deadline, T.bid_deadline),
      source_document_ids = ARRAY(
        SELECT DISTINCT id FROM UNNEST(ARRAY_CONCAT(T.source_document_ids, @source_document_ids)) AS id
      ),
      content_hash = COALESCE(@content_hash, T.content_hash),
      last_updated_at = @last_updated_at
    WHEN NOT MATCHED THEN INSERT (
      project_id, tracking_number, county_id, project_type, niche_tags,
      estimated_budget, requirements, stage, location, bid_deadline,
      source_document_ids, content_hash, first_seen_at, last_updated_at
    ) VALUES (
      @project_id, @tracking_number, @county_id, @project_type, @niche_tags,
      @estimated_budget, @requirements, @stage, @location, @bid_deadline,
      @source_document_ids, @content_hash, @first_seen_at, @last_updated_at
    )
  `;

  await bigquery.query({
    query,
    params: {
      project_id: project.project_id,
      tracking_number: project.tracking_number ?? null,
      county_id: project.county_id,
      project_type: project.project_type ?? null,
      niche_tags: project.niche_tags ?? [],
      estimated_budget: project.estimated_budget ?? null,
      requirements: project.requirements ?? null,
      stage: project.stage ?? 'subcommittee',
      location: project.location ?? null,
      bid_deadline: project.bid_deadline ?? null,
      source_document_ids: project.source_document_ids ?? [],
      content_hash: project.content_hash ?? null,
      first_seen_at: project.first_seen_at ?? now,
      last_updated_at: now,
    },
  });
}

export async function insertProjectChunk(
  bigquery: BigQuery,
  chunk: {
    chunk_id: string;
    project_id: string;
    document_id: string;
    county_id: string;
    parent_chunk_id?: string;
    text: string;
    is_project: boolean;
    niche_tags?: string[];
  },
): Promise<void> {
  if (MOCK_MODE) {
    console.log('[MOCK] Insert chunk:', chunk.chunk_id);
    return;
  }

  const table = bigquery.dataset(BQ_DATASET).table(BQ_TABLE_PROJECT_CHUNKS);
  await table.insert([{
    chunk_id: chunk.chunk_id,
    project_id: chunk.project_id,
    document_id: chunk.document_id,
    county_id: chunk.county_id,
    parent_chunk_id: chunk.parent_chunk_id ?? null,
    text: chunk.text.slice(0, 10000),
    is_project: chunk.is_project,
    niche_tags: chunk.niche_tags ?? [],
    created_at: new Date().toISOString(),
  }]);
}

export async function publishProjectCreated(
  pubsub: PubSub,
  message: {
    project_id: string;
    tracking_number?: string;
    county_id: string;
    niche_tags: string[];
    stage: ClassificationResult['stage'];
    document_id: string;
    chunk_ids: string[];
    trace_id: string;
  },
): Promise<void> {
  const payload = projectCreatedSchema.parse({
    ...createBaseMessage(message.trace_id),
    project_id: message.project_id,
    tracking_number: message.tracking_number,
    county_id: message.county_id,
    niche_tags: message.niche_tags,
    stage: message.stage,
    document_id: message.document_id,
    chunk_ids: message.chunk_ids,
  });

  if (MOCK_MODE) {
    console.log('[MOCK] Published project-created:', payload);
    return;
  }

  await pubsub.topic(TOPIC_PROJECTS_CREATED).publishMessage({
    data: Buffer.from(JSON.stringify(payload)),
  });
}

export interface ClassifyResult {
  trace_id: string;
  projects_created: string[];
  chunks_processed: number;
}

export async function runClassifier(input: {
  gcs_uri: string;
  document_id: string;
  county_id: string;
  trace_id?: string;
}): Promise<ClassifyResult> {
  const traceId = input.trace_id ?? randomUUID();
  const staging = await loadStagingDocument(input.gcs_uri);
  const bigquery = new BigQuery();
  const pubsub = new PubSub();

  const projectsCreated: string[] = [];
  const childChunks = staging.chunks.filter((c) => c.chunk_type === 'child' || !c.parent_chunk_id || c.text.length > 40);

  for (const chunk of childChunks.length ? childChunks : staging.chunks) {
    const classification = await classifyChunk(chunk.text);
    const projectId = createProjectId(
      staging.county_id,
      classification.tracking_number,
      chunk.chunk_id,
    );

    await insertProjectChunk(bigquery, {
      chunk_id: chunk.chunk_id,
      project_id: projectId,
      document_id: staging.document_id,
      county_id: staging.county_id,
      parent_chunk_id: chunk.parent_chunk_id,
      text: chunk.text,
      is_project: classification.is_project,
      niche_tags: classification.niche_tags,
    });

    if (!classification.is_project || classification.confidence < 0.5) {
      continue;
    }

    const now = new Date().toISOString();
    await mergeUpsertProject(bigquery, {
      project_id: projectId,
      tracking_number: classification.tracking_number,
      county_id: staging.county_id,
      project_type: classification.project_type,
      niche_tags: classification.niche_tags,
      estimated_budget: classification.estimated_budget,
      requirements: classification.requirements,
      stage: classification.stage,
      location: classification.location,
      bid_deadline: classification.bid_deadline,
      source_document_ids: [staging.document_id],
      content_hash: staging.content_hash,
      first_seen_at: now,
      last_updated_at: now,
    });

    await publishProjectCreated(pubsub, {
      project_id: projectId,
      tracking_number: classification.tracking_number,
      county_id: staging.county_id,
      niche_tags: classification.niche_tags,
      stage: classification.stage,
      document_id: staging.document_id,
      chunk_ids: [chunk.chunk_id],
      trace_id: traceId,
    });

    projectsCreated.push(projectId);
  }

  return {
    trace_id: traceId,
    projects_created: projectsCreated,
    chunks_processed: staging.chunks.length,
  };
}
