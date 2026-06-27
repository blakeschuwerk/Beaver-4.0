import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import type { CountyConfig } from '@beaver/shared';
import { buildScrapeJobMessage } from './dispatcher.js';

describe('buildScrapeJobMessage', () => {
  it('includes timezone for Legistar counties', () => {
    const county: CountyConfig = {
      county_id: 'sonoma-county',
      name: 'Sonoma County Board of Supervisors',
      state: 'CA',
      source_urls: ['https://sonoma-county.legistar.com'],
      scraper_strategy: 'civic_scraper',
      platform: 'legistar',
      timezone: 'America/Los_Angeles',
      broken: false,
      failure_count: 0,
    };

    const message = buildScrapeJobMessage(county, randomUUID());

    assert.equal(message.county_id, 'sonoma-county');
    assert.equal(message.platform, 'legistar');
    assert.equal(message.timezone, 'America/Los_Angeles');
    assert.equal(message.scraper_strategy, 'civic_scraper');
  });

  it('omits timezone when county config has none', () => {
    const county: CountyConfig = {
      county_id: 'nc-nashcounty',
      name: 'Nash County NC',
      state: 'NC',
      source_urls: ['https://nc-nashcounty.civicplus.com/AgendaCenter'],
      scraper_strategy: 'civic_scraper',
      platform: 'civicplus',
      broken: false,
      failure_count: 0,
    };

    const message = buildScrapeJobMessage(county, randomUUID());

    assert.equal(message.platform, 'civicplus');
    assert.equal(message.timezone, undefined);
  });
});
