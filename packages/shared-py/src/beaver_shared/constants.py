"""Shared constants — must stay in sync with packages/shared/src/constants.ts"""

SCHEMA_VERSION = "1.0.0"

GCP_REGION_DEFAULT = "us-central1"
BQ_DATASET = "beaver_pipeline"

GCS_RAW_DOCUMENTS_BUCKET = "beaver-raw-documents"
GCS_STAGING_EXTRACTED_BUCKET = "beaver-staging-extracted"

FS_COUNTIES_COLLECTION = "counties"
FS_USER_PROFILES_COLLECTION = "user_profiles"

BQ_TABLE_SCRAPE_ROSTER = "scrape_roster"
BQ_TABLE_PROJECTS = "projects"
BQ_TABLE_PROJECT_CHUNKS = "project_chunks"
BQ_TABLE_MATCHES = "matches"

TOPIC_DISPATCHER_TICK = "dispatcher-tick"
TOPIC_SCRAPE_JOBS = "scrape-jobs"
TOPIC_RAW_DOCUMENTS = "raw-documents"
TOPIC_EXTRACTED_CHUNKS = "extracted-chunks"
TOPIC_PROJECTS_CREATED = "projects-created"
TOPIC_MATCHES_CREATED = "matches-created"

DLQ_SUFFIX = "-dlq"

SERVICE_DISPATCHER = "beaver-dispatcher"
SERVICE_SCRAPER = "beaver-scraper"
SERVICE_ANALYZER = "beaver-analyzer"
SERVICE_CLASSIFIER = "beaver-classifier"
SERVICE_PERSONALIZATION = "beaver-personalization"

PROJECT_STAGES = ("subcommittee", "approved", "bidding", "awarded", "closed")
DOCUMENT_TYPES = (
    "agenda", "packet", "minutes", "rfp", "scope_of_work",
    "tabulation", "bid_roster", "other",
)
SCRAPER_STRATEGIES = ("civic_scraper", "crawl4ai", "custom")

CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3
CIRCUIT_BREAKER_COOLDOWN_HOURS = 24

SECRET_LLM_ENDPOINT_URL = "llm-endpoint-url"
SECRET_LLM_API_KEY = "runpod-api-key"
