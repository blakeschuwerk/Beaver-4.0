resource "google_bigquery_dataset" "pipeline" {
  dataset_id = var.bq_dataset_id
  location   = var.region
}

resource "google_bigquery_table" "scrape_roster" {
  dataset_id = google_bigquery_dataset.pipeline.dataset_id
  table_id   = "scrape_roster"

  schema = jsonencode([
    { name = "county_id", type = "STRING", mode = "REQUIRED" },
    { name = "priority", type = "INTEGER", mode = "REQUIRED" },
    { name = "last_scraped_at", type = "TIMESTAMP", mode = "NULLABLE" },
    { name = "next_scrape_at", type = "TIMESTAMP", mode = "NULLABLE" },
    { name = "status", type = "STRING", mode = "REQUIRED" },
  ])
}

resource "google_bigquery_table" "projects" {
  dataset_id = google_bigquery_dataset.pipeline.dataset_id
  table_id   = "projects"

  schema = jsonencode([
    { name = "project_id", type = "STRING", mode = "REQUIRED" },
    { name = "tracking_number", type = "STRING", mode = "NULLABLE" },
    { name = "county_id", type = "STRING", mode = "REQUIRED" },
    { name = "project_type", type = "STRING", mode = "NULLABLE" },
    { name = "niche_tags", type = "STRING", mode = "REPEATED" },
    { name = "estimated_budget", type = "FLOAT", mode = "NULLABLE" },
    { name = "requirements", type = "STRING", mode = "NULLABLE" },
    { name = "stage", type = "STRING", mode = "REQUIRED" },
    { name = "location", type = "STRING", mode = "NULLABLE" },
    { name = "bid_deadline", type = "TIMESTAMP", mode = "NULLABLE" },
    { name = "source_document_ids", type = "STRING", mode = "REPEATED" },
    { name = "content_hash", type = "STRING", mode = "NULLABLE" },
    { name = "first_seen_at", type = "TIMESTAMP", mode = "REQUIRED" },
    { name = "last_updated_at", type = "TIMESTAMP", mode = "REQUIRED" },
  ])
}

resource "google_bigquery_table" "project_chunks" {
  dataset_id = google_bigquery_dataset.pipeline.dataset_id
  table_id   = "project_chunks"

  schema = jsonencode([
    { name = "chunk_id", type = "STRING", mode = "REQUIRED" },
    { name = "project_id", type = "STRING", mode = "REQUIRED" },
    { name = "document_id", type = "STRING", mode = "REQUIRED" },
    { name = "county_id", type = "STRING", mode = "REQUIRED" },
    { name = "parent_chunk_id", type = "STRING", mode = "NULLABLE" },
    { name = "text", type = "STRING", mode = "REQUIRED" },
    { name = "is_project", type = "BOOLEAN", mode = "REQUIRED" },
    { name = "niche_tags", type = "STRING", mode = "REPEATED" },
    { name = "created_at", type = "TIMESTAMP", mode = "REQUIRED" },
  ])
}

resource "google_bigquery_table" "matches" {
  dataset_id = google_bigquery_dataset.pipeline.dataset_id
  table_id   = "matches"

  schema = jsonencode([
    { name = "match_id", type = "STRING", mode = "REQUIRED" },
    { name = "user_id", type = "STRING", mode = "REQUIRED" },
    { name = "project_id", type = "STRING", mode = "REQUIRED" },
    { name = "county_id", type = "STRING", mode = "REQUIRED" },
    { name = "relevance_score", type = "FLOAT", mode = "REQUIRED" },
    { name = "matched_at", type = "TIMESTAMP", mode = "REQUIRED" },
    { name = "match_method", type = "STRING", mode = "REQUIRED" },
  ])
}
