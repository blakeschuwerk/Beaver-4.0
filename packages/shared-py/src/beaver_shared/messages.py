"""Pub/Sub message pydantic models — validate against packages/shared/contracts/*.json"""

from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from beaver_shared.constants import SCHEMA_VERSION


class BaseMessage(BaseModel):
    schema_version: str = SCHEMA_VERSION
    trace_id: UUID
    published_at: datetime


class DispatcherTickMessage(BaseMessage):
    tick_id: str
    scheduled_at: datetime


class ScrapeJobMessage(BaseMessage):
    job_id: str
    county_id: str
    scraper_strategy: Literal["civic_scraper", "crawl4ai", "custom"]
    source_urls: list[str]
    platform: Optional[str] = None


class RawDocumentMessage(BaseMessage):
    gcs_uri: str
    document_id: str
    county_id: str
    content_hash: str
    doc_type: Literal[
        "agenda", "packet", "minutes", "rfp", "scope_of_work",
        "tabulation", "bid_roster", "other",
    ]
    source_url: Optional[str] = None
    meeting_date: Optional[str] = None


class ExtractedChunksMessage(BaseMessage):
    gcs_uri: str
    document_id: str
    county_id: str
    chunk_count: int = Field(ge=0)
    content_hash: Optional[str] = None


class ProjectCreatedMessage(BaseMessage):
    project_id: str
    tracking_number: Optional[str] = None
    county_id: str
    niche_tags: list[str]
    stage: Literal["subcommittee", "approved", "bidding", "awarded", "closed"]
    document_id: str
    chunk_ids: list[str]


class MatchCreatedMessage(BaseMessage):
    match_id: str
    user_id: str
    project_id: str
    relevance_score: float = Field(ge=0, le=1)
    county_id: str
