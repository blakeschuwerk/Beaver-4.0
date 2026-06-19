"""Firestore and BigQuery row models."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class CountyConfig(BaseModel):
    county_id: str
    name: str
    state: str
    source_urls: list[str]
    scraper_strategy: Literal["civic_scraper", "crawl4ai", "custom"]
    platform: Optional[str] = None
    broken: bool = False
    failure_count: int = Field(default=0, ge=0)
    last_error: Optional[str] = None
    broken_until: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ScrapeRosterRow(BaseModel):
    county_id: str
    priority: int
    last_scraped_at: Optional[datetime] = None
    next_scrape_at: Optional[datetime] = None
    status: Literal["queued", "in_progress", "completed", "skipped"]


class ProjectRow(BaseModel):
    project_id: str
    tracking_number: Optional[str] = None
    county_id: str
    project_type: Optional[str] = None
    niche_tags: list[str]
    estimated_budget: Optional[float] = None
    requirements: Optional[str] = None
    stage: Literal["subcommittee", "approved", "bidding", "awarded", "closed"]
    location: Optional[str] = None
    bid_deadline: Optional[datetime] = None
    source_document_ids: list[str]
    content_hash: Optional[str] = None
    first_seen_at: datetime
    last_updated_at: datetime


class ProjectChunkRow(BaseModel):
    chunk_id: str
    project_id: str
    document_id: str
    county_id: str
    parent_chunk_id: Optional[str] = None
    text: str
    is_project: bool
    niche_tags: Optional[list[str]] = None
    created_at: datetime
