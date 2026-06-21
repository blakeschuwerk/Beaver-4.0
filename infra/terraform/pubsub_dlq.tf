# Dead-letter queue wiring — Pub/Sub service agent needs publisher on DLQ topics
# and subscriber on source subscriptions for dead-letter delivery.

data "google_project" "current" {
  project_id = var.project_id
}

locals {
  pubsub_service_agent = "service-${data.google_project.current.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
  dlq_topics = [
    "dispatcher-tick-dlq",
    "scrape-jobs-dlq",
    "raw-documents-dlq",
    "extracted-chunks-dlq",
    "projects-created-dlq",
    "matches-created-dlq",
  ]
}

# Allow Pub/Sub to publish dead-lettered messages to DLQ topics
resource "google_pubsub_topic_iam_member" "dlq_publisher" {
  for_each = toset(local.dlq_topics)
  topic    = each.value
  role     = "roles/pubsub.publisher"
  member   = "serviceAccount:${local.pubsub_service_agent}"
}

# Allow Pub/Sub to pull/ack from source subscriptions when forwarding to DLQ
resource "google_pubsub_subscription_iam_member" "dlq_subscriber_scrape_jobs" {
  subscription = google_pubsub_subscription.scrape_jobs_sub.name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:${local.pubsub_service_agent}"
}

resource "google_pubsub_subscription_iam_member" "dlq_subscriber_raw_documents" {
  subscription = google_pubsub_subscription.raw_documents_sub.name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:${local.pubsub_service_agent}"
}

resource "google_pubsub_subscription_iam_member" "dlq_subscriber_extracted_chunks" {
  subscription = google_pubsub_subscription.extracted_chunks_sub.name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:${local.pubsub_service_agent}"
}

resource "google_pubsub_subscription_iam_member" "dlq_subscriber_projects_created" {
  subscription = google_pubsub_subscription.projects_created_sub.name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:${local.pubsub_service_agent}"
}

resource "google_pubsub_subscription_iam_member" "dlq_subscriber_dispatcher_tick" {
  subscription = google_pubsub_subscription.dispatcher_tick_sub.name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:${local.pubsub_service_agent}"
}

# Pull subscriptions on DLQ topics for inspection
resource "google_pubsub_subscription" "dispatcher_tick_dlq_pull" {
  name  = "dispatcher-tick-dlq-pull"
  topic = google_pubsub_topic.dlq["dispatcher-tick"].name
  message_retention_duration = "604800s"
}

resource "google_pubsub_subscription" "scrape_jobs_dlq_pull" {
  name  = "scrape-jobs-dlq-pull"
  topic = google_pubsub_topic.dlq["scrape-jobs"].name
  message_retention_duration = "604800s"
}

resource "google_pubsub_subscription" "raw_documents_dlq_pull" {
  name  = "raw-documents-dlq-pull"
  topic = google_pubsub_topic.dlq["raw-documents"].name
  message_retention_duration = "604800s"
}

resource "google_pubsub_subscription" "extracted_chunks_dlq_pull" {
  name  = "extracted-chunks-dlq-pull"
  topic = google_pubsub_topic.dlq["extracted-chunks"].name
  message_retention_duration = "604800s"
}

resource "google_pubsub_subscription" "projects_created_dlq_pull" {
  name  = "projects-created-dlq-pull"
  topic = google_pubsub_topic.dlq["projects-created"].name
  message_retention_duration = "604800s"
}

resource "google_pubsub_subscription" "matches_created_dlq_pull" {
  name  = "matches-created-dlq-pull"
  topic = google_pubsub_topic.dlq["matches-created"].name
  message_retention_duration = "604800s"
}
