locals {
  image_base = "${var.region}-docker.pkg.dev/${var.project_id}/beaver"
}

resource "google_cloud_run_v2_service" "dispatcher" {
  name     = "beaver-dispatcher"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.dispatcher.email
    containers {
      image = "${local.image_base}/beaver-dispatcher:latest"
      ports { container_port = 8080 }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "FIRESTORE_DATABASE"
        value = "beaver-firebase"
      }
      resources {
        limits = { cpu = "1", memory = "512Mi" }
      }
    }
    scaling { max_instance_count = 3 }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }
}

resource "google_cloud_run_v2_service" "scraper" {
  name     = "beaver-scraper"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.scraper.email
    containers {
      image = "${local.image_base}/beaver-scraper:latest"
      ports { container_port = 8080 }
      env {
        name  = "GCS_RAW_BUCKET"
        value = google_storage_bucket.raw_documents.name
      }
      env {
        name  = "FIRESTORE_DATABASE"
        value = "beaver-firebase"
      }
      env {
        name  = "SCRAPER_REAL"
        value = "false"
      }
      resources {
        limits = { cpu = "2", memory = "2Gi" }
      }
    }
    scaling { max_instance_count = 5 }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }
}

resource "google_cloud_run_v2_service" "analyzer" {
  name     = "beaver-analyzer"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.analyzer.email
    containers {
      image = "${local.image_base}/beaver-analyzer:latest"
      ports { container_port = 8080 }
      env {
        name  = "GCS_RAW_BUCKET"
        value = google_storage_bucket.raw_documents.name
      }
      env {
        name  = "GCS_STAGING_BUCKET"
        value = google_storage_bucket.staging_extracted.name
      }
      env {
        name  = "USE_DOCLING"
        value = "false"
      }
      resources {
        limits = { cpu = "2", memory = "4Gi" }
      }
    }
    scaling { max_instance_count = 3 }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }
}

resource "google_cloud_run_v2_service" "classifier" {
  name     = "beaver-classifier"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.classifier.email
    containers {
      image = "${local.image_base}/beaver-classifier:latest"
      ports { container_port = 8080 }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "LLM_MOCK_MODE"
        value = "true"
      }
      env {
        name = "LLM_ENDPOINT_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.llm_endpoint_url.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "LLM_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.llm_api_key.secret_id
            version = "latest"
          }
        }
      }
      resources {
        limits = { cpu = "1", memory = "1Gi" }
      }
    }
    scaling { max_instance_count = 5 }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }
}

resource "google_cloud_run_v2_service" "personalization" {
  name     = "beaver-personalization"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.personalization.email
    containers {
      image = "${local.image_base}/beaver-personalization:latest"
      ports { container_port = 8080 }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "FIRESTORE_DATABASE"
        value = "beaver-firebase"
      }
      env {
        name  = "LLM_MOCK_MODE"
        value = "true"
      }
      env {
        name = "LLM_ENDPOINT_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.llm_endpoint_url.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "LLM_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.llm_api_key.secret_id
            version = "latest"
          }
        }
      }
      env {
        name  = "MATCH_MIN_RELEVANCE"
        value = "0.5"
      }
      env {
        name  = "MATCH_MAX_PER_PROJECT"
        value = "10"
      }
      resources {
        limits = { cpu = "1", memory = "512Mi" }
      }
    }
    scaling { max_instance_count = 3 }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }
}

resource "google_cloud_scheduler_job" "dispatcher_tick" {
  name        = "beaver-dispatcher-tick"
  description = "Triggers dispatcher to publish scrape jobs"
  schedule    = var.scheduler_cron
  region      = var.region

  pubsub_target {
    topic_name = google_pubsub_topic.dispatcher_tick.id
    data       = base64encode(jsonencode({
      schema_version = "1.0.0"
      trace_id       = "00000000-0000-4000-8000-000000000001"
      published_at   = "1970-01-01T00:00:00.000Z"
      tick_id        = "scheduler"
      scheduled_at   = "1970-01-01T00:00:00.000Z"
    }))
  }

  depends_on = [google_project_iam_member.scheduler_pubsub]
}

# TODO: Discovery Engine API — purpose unresolved. Do not provision until product direction is clear.
# Staging GCS bucket may eventually feed Discovery Engine for search/RAG over extracted chunks.
