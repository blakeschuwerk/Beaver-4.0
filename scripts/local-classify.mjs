#!/usr/bin/env node
/**
 * Local classify + match: read local-run/staging chunks.json, call local Llama.
 *
 * Usage: pnpm local:classify
 * Requires: .env.local, pnpm build, local-run/staging from local_pipeline.py
 */

import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadEnvLocal, REPO_ROOT } from './load-env-local.mjs';
import { createProjectId } from '../packages/shared/dist/utils.js';

loadEnvLocal();

// Dynamic imports AFTER loadEnvLocal(): llm-client.js and personalization.js
// both read LLM_MOCK_MODE/MOCK_MODE into module-level consts at import time,
// so static imports here (hoisted before this file's own statements run)
// would freeze mock mode on regardless of .env.local — silently faking every
// classification and match. See DEBUG-LOG.md.
const { classifyChunk } = await import('../functions/classifier/dist/llm-client.js');
const { filterUsersByNiche, scoreRelevance } = await import('../functions/personalization/dist/personalization.js');

const LOCAL_RUN = join(REPO_ROOT, 'local-run');
const STAGING = join(LOCAL_RUN, 'staging');
const TEST_USER_PATH = join(REPO_ROOT, 'config', 'test-user.json');

function findChunksFiles(dir) {
  const results = [];
  if (!existsSync(dir)) return results;
  for (const countyEntry of readdirSync(dir, { withFileTypes: true })) {
    if (!countyEntry.isDirectory()) continue;
    const countyDir = join(dir, countyEntry.name);
    for (const docEntry of readdirSync(countyDir, { withFileTypes: true })) {
      if (!docEntry.isDirectory()) continue;
      const chunksPath = join(countyDir, docEntry.name, 'chunks.json');
      if (existsSync(chunksPath)) results.push(chunksPath);
    }
  }
  return results;
}

async function classifyStagingDocument(staging) {
  const projects = [];
  const childChunks = staging.chunks.filter(
    (c) => c.chunk_type === 'child' || !c.parent_chunk_id || c.text.length > 40,
  );
  const chunksToProcess = childChunks.length ? childChunks : staging.chunks;

  for (const chunk of chunksToProcess) {
    const classification = await classifyChunk(chunk.text);
    const projectId = createProjectId(
      staging.county_id,
      classification.tracking_number,
      chunk.chunk_id,
    );

    if (!classification.is_project || classification.confidence < 0.5) {
      continue;
    }

    projects.push({
      project_id: projectId,
      tracking_number: classification.tracking_number,
      county_id: staging.county_id,
      document_id: staging.document_id,
      chunk_id: chunk.chunk_id,
      niche_tags: classification.niche_tags,
      stage: classification.stage,
      project_type: classification.project_type,
      estimated_budget: classification.estimated_budget,
      requirements: classification.requirements,
      confidence: classification.confidence,
    });
  }

  return projects;
}

async function main() {
  if (!existsSync(STAGING)) {
    console.error('No local-run/staging — run: pnpm local:demo or pnpm local:scrape-extract first');
    process.exit(1);
  }

  if (!existsSync(TEST_USER_PATH)) {
    console.error('Missing config/test-user.json');
    process.exit(1);
  }

  const testUser = JSON.parse(readFileSync(TEST_USER_PATH, 'utf8'));
  const chunksFiles = findChunksFiles(STAGING);

  if (chunksFiles.length === 0) {
    console.error('No chunks.json files found under local-run/staging');
    process.exit(1);
  }

  mkdirSync(LOCAL_RUN, { recursive: true });
  const projectsPath = join(LOCAL_RUN, 'projects.jsonl');
  const matchesPath = join(LOCAL_RUN, 'matches.jsonl');
  writeFileSync(projectsPath, '');
  writeFileSync(matchesPath, '');

  const allProjects = [];
  const allMatches = [];
  const traceId = randomUUID();

  for (const chunksPath of chunksFiles) {
    const staging = JSON.parse(readFileSync(chunksPath, 'utf8'));
    console.log(`\nClassifying ${staging.document_id} (${staging.county_id})...`);

    const projects = await classifyStagingDocument(staging);
    for (const project of projects) {
      allProjects.push(project);
      writeFileSync(projectsPath, JSON.stringify(project) + '\n', { flag: 'a' });

      const projectMessage = {
        schema_version: '1.0.0',
        trace_id: traceId,
        published_at: new Date().toISOString(),
        project_id: project.project_id,
        tracking_number: project.tracking_number,
        county_id: project.county_id,
        niche_tags: project.niche_tags,
        stage: project.stage,
        document_id: project.document_id,
        chunk_ids: [project.chunk_id],
      };

      const nicheUsers = filterUsersByNiche([testUser], projectMessage);
      for (const user of nicheUsers) {
        const relevanceScore = await scoreRelevance(user, projectMessage);
        const minRelevance = Number(process.env.MATCH_MIN_RELEVANCE ?? '0.5');
        if (relevanceScore < minRelevance) continue;

        const match = {
          match_id: `match-${user.user_id}-${project.project_id}`,
          user_id: user.user_id,
          project_id: project.project_id,
          county_id: project.county_id,
          relevance_score: relevanceScore,
          matched_at: new Date().toISOString(),
        };
        allMatches.push(match);
        writeFileSync(matchesPath, JSON.stringify(match) + '\n', { flag: 'a' });
      }
    }

    console.log(`  -> ${projects.length} project(s) from ${chunksPath}`);
  }

  const summary = {
    trace_id: traceId,
    documents_processed: chunksFiles.length,
    projects_found: allProjects.length,
    matches_created: allMatches.length,
    llm_endpoint: process.env.LLM_ENDPOINT_URL,
    llm_model: process.env.LLM_MODEL,
    sample_project: allProjects[0] ?? null,
    sample_match: allMatches[0] ?? null,
    by_county: Object.fromEntries(
      [...new Set(allProjects.map((p) => p.county_id))].map((cid) => [
        cid,
        allProjects.filter((p) => p.county_id === cid).length,
      ]),
    ),
  };

  const summaryPath = join(LOCAL_RUN, 'classify-summary.json');
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  console.log('\n=== Local classify + match summary ===');
  console.log(`Documents processed: ${summary.documents_processed}`);
  console.log(`Projects found:      ${summary.projects_found}`);
  console.log(`Matches created:     ${summary.matches_created}`);
  console.log(`By county:           ${JSON.stringify(summary.by_county)}`);
  if (summary.sample_project) {
    console.log(`Sample project:      ${summary.sample_project.project_id} (${summary.sample_project.tracking_number ?? 'no tracking #'})`);
  }
  if (summary.sample_match) {
    console.log(`Sample match:        score=${summary.sample_match.relevance_score} for ${summary.sample_match.project_id}`);
  }
  console.log(`\nWrote ${projectsPath}`);
  console.log(`Wrote ${matchesPath}`);
  console.log(`Wrote ${summaryPath}`);

  if (allProjects.length === 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
