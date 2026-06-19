resource "google_artifact_registry_repository" "beaver" {
  location      = var.region
  repository_id = "beaver"
  description   = "Beaver 4.0 Cloud Run container images"
  format        = "DOCKER"
}

resource "google_storage_bucket" "raw_documents" {
  name                        = "${var.gcs_raw_bucket}-${var.project_id}"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = var.environment != "prod"

  versioning {
    enabled = true
  }
}

resource "google_storage_bucket" "staging_extracted" {
  name                        = "${var.gcs_staging_bucket}-${var.project_id}"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = var.environment != "prod"
}

# GCS -> Pub/Sub notifications
resource "google_storage_notification" "raw_to_pubsub" {
  bucket         = google_storage_bucket.raw_documents.name
  payload_format = "JSON_API_V1"
  topic          = google_pubsub_topic.raw_documents.id
  event_types    = ["OBJECT_FINALIZE"]
  depends_on     = [google_pubsub_topic_iam_binding.raw_documents_publisher]
}

resource "google_storage_notification" "staging_to_pubsub" {
  bucket         = google_storage_bucket.staging_extracted.name
  payload_format = "JSON_API_V1"
  topic          = google_pubsub_topic.extracted_chunks.id
  event_types    = ["OBJECT_FINALIZE"]
  depends_on     = [google_pubsub_topic_iam_binding.staging_publisher]
}

resource "google_pubsub_topic_iam_binding" "raw_documents_publisher" {
  topic   = google_pubsub_topic.raw_documents.name
  role    = "roles/pubsub.publisher"
  members = ["serviceAccount:${data.google_storage_project_service_account.gcs.email_address}"]
}

resource "google_pubsub_topic_iam_binding" "staging_publisher" {
  topic   = google_pubsub_topic.extracted_chunks.name
  role    = "roles/pubsub.publisher"
  members = ["serviceAccount:${data.google_storage_project_service_account.gcs.email_address}"]
}

data "google_storage_project_service_account" "gcs" {
  project = var.project_id
}
