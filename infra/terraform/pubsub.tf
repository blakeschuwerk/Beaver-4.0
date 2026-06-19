locals {
  topics = [
    "dispatcher-tick",
    "scrape-jobs",
    "raw-documents",
    "extracted-chunks",
    "projects-created",
    "matches-created",
  ]
}

resource "google_pubsub_topic" "dispatcher_tick" {
  name = "dispatcher-tick"
}

resource "google_pubsub_topic" "scrape_jobs" {
  name = "scrape-jobs"
}

resource "google_pubsub_topic" "raw_documents" {
  name = "raw-documents"
}

resource "google_pubsub_topic" "extracted_chunks" {
  name = "extracted-chunks"
}

resource "google_pubsub_topic" "projects_created" {
  name = "projects-created"
}

resource "google_pubsub_topic" "matches_created" {
  name = "matches-created"
}

# Dead letter queues
resource "google_pubsub_topic" "dlq" {
  for_each = toset(local.topics)
  name     = "${each.value}-dlq"
}

resource "google_pubsub_subscription" "scrape_jobs_sub" {
  name  = "scrape-jobs-scraper-push"
  topic = google_pubsub_topic.scrape_jobs.name

  push_config {
    push_endpoint = google_cloud_run_v2_service.scraper.uri
    oidc_token {
      service_account_email = google_service_account.scraper.email
    }
  }

  ack_deadline_seconds       = 600
  message_retention_duration = "86400s"
  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dlq["scrape-jobs"].id
    max_delivery_attempts = 5
  }
}

resource "google_pubsub_subscription" "raw_documents_sub" {
  name  = "raw-documents-analyzer-push"
  topic = google_pubsub_topic.raw_documents.name

  push_config {
    push_endpoint = google_cloud_run_v2_service.analyzer.uri
    oidc_token {
      service_account_email = google_service_account.analyzer.email
    }
  }

  ack_deadline_seconds = 600
  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dlq["raw-documents"].id
    max_delivery_attempts = 5
  }
}

resource "google_pubsub_subscription" "extracted_chunks_sub" {
  name  = "extracted-chunks-classifier-push"
  topic = google_pubsub_topic.extracted_chunks.name

  push_config {
    push_endpoint = google_cloud_run_v2_service.classifier.uri
    oidc_token {
      service_account_email = google_service_account.classifier.email
    }
  }

  ack_deadline_seconds = 600
  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dlq["extracted-chunks"].id
    max_delivery_attempts = 5
  }
}

resource "google_pubsub_subscription" "projects_created_sub" {
  name  = "projects-created-personalization-push"
  topic = google_pubsub_topic.projects_created.name

  push_config {
    push_endpoint = google_cloud_run_v2_service.personalization.uri
    oidc_token {
      service_account_email = google_service_account.personalization.email
    }
  }

  ack_deadline_seconds = 300
  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "300s"
  }

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dlq["projects-created"].id
    max_delivery_attempts = 5
  }
}

resource "google_pubsub_subscription" "dispatcher_tick_sub" {
  name  = "dispatcher-tick-push"
  topic = google_pubsub_topic.dispatcher_tick.name

  push_config {
    push_endpoint = google_cloud_run_v2_service.dispatcher.uri
    oidc_token {
      service_account_email = google_service_account.dispatcher.email
    }
  }

  ack_deadline_seconds = 300
}
