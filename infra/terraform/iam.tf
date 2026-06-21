resource "google_service_account" "dispatcher" {
  account_id   = "beaver-dispatcher"
  display_name = "Beaver Dispatcher (F1)"
}

resource "google_service_account" "scraper" {
  account_id   = "beaver-scraper"
  display_name = "Beaver Scraper (F2)"
}

resource "google_service_account" "analyzer" {
  account_id   = "beaver-analyzer"
  display_name = "Beaver Analyzer (F3)"
}

resource "google_service_account" "classifier" {
  account_id   = "beaver-classifier"
  display_name = "Beaver Classifier (F4)"
}

resource "google_service_account" "personalization" {
  account_id   = "beaver-personalization"
  display_name = "Beaver Personalization (F5)"
}

resource "google_service_account" "scheduler" {
  account_id   = "beaver-scheduler"
  display_name = "Beaver Cloud Scheduler"
}

# Dispatcher: Firestore read, BQ read, Pub/Sub publish
resource "google_project_iam_member" "dispatcher_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.dispatcher.email}"
}

resource "google_project_iam_member" "dispatcher_bq" {
  project = var.project_id
  role    = "roles/bigquery.dataViewer"
  member  = "serviceAccount:${google_service_account.dispatcher.email}"
}

resource "google_project_iam_member" "dispatcher_bq_job_user" {
  project = var.project_id
  role    = "roles/bigquery.jobUser"
  member  = "serviceAccount:${google_service_account.dispatcher.email}"
}

resource "google_project_iam_member" "dispatcher_pubsub" {
  project = var.project_id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.dispatcher.email}"
}

# Scraper: Firestore write, GCS write
resource "google_project_iam_member" "scraper_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.scraper.email}"
}

resource "google_storage_bucket_iam_member" "scraper_gcs" {
  bucket = google_storage_bucket.raw_documents.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.scraper.email}"
}

# Analyzer: GCS read/write
resource "google_storage_bucket_iam_member" "analyzer_raw_read" {
  bucket = google_storage_bucket.raw_documents.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.analyzer.email}"
}

resource "google_storage_bucket_iam_member" "analyzer_staging_write" {
  bucket = google_storage_bucket.staging_extracted.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.analyzer.email}"
}

# Classifier: GCS read, BQ write, Pub/Sub publish, Secret access
resource "google_storage_bucket_iam_member" "classifier_staging_read" {
  bucket = google_storage_bucket.staging_extracted.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.classifier.email}"
}

resource "google_project_iam_member" "classifier_bq" {
  project = var.project_id
  role    = "roles/bigquery.dataEditor"
  member  = "serviceAccount:${google_service_account.classifier.email}"
}

resource "google_project_iam_member" "classifier_bq_job_user" {
  project = var.project_id
  role    = "roles/bigquery.jobUser"
  member  = "serviceAccount:${google_service_account.classifier.email}"
}

resource "google_project_iam_member" "classifier_pubsub" {
  project = var.project_id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.classifier.email}"
}

resource "google_secret_manager_secret_iam_member" "classifier_llm_url" {
  secret_id = google_secret_manager_secret.llm_endpoint_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.classifier.email}"
}

resource "google_secret_manager_secret_iam_member" "classifier_llm_key" {
  secret_id = google_secret_manager_secret.llm_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.classifier.email}"
}

# Personalization: Firestore read, BQ write, Pub/Sub publish
resource "google_project_iam_member" "personalization_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.personalization.email}"
}

resource "google_project_iam_member" "personalization_bq" {
  project = var.project_id
  role    = "roles/bigquery.dataEditor"
  member  = "serviceAccount:${google_service_account.personalization.email}"
}

resource "google_project_iam_member" "personalization_bq_job_user" {
  project = var.project_id
  role    = "roles/bigquery.jobUser"
  member  = "serviceAccount:${google_service_account.personalization.email}"
}

resource "google_project_iam_member" "personalization_pubsub" {
  project = var.project_id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.personalization.email}"
}

# Scheduler: Pub/Sub publish to dispatcher-tick
resource "google_project_iam_member" "scheduler_pubsub" {
  project = var.project_id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.scheduler.email}"
}

# Allow Pub/Sub push SA to invoke Cloud Run
resource "google_cloud_run_v2_service_iam_member" "scraper_invoker" {
  location = google_cloud_run_v2_service.scraper.location
  name     = google_cloud_run_v2_service.scraper.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scraper.email}"
}

resource "google_cloud_run_v2_service_iam_member" "analyzer_invoker" {
  location = google_cloud_run_v2_service.analyzer.location
  name     = google_cloud_run_v2_service.analyzer.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.analyzer.email}"
}

resource "google_cloud_run_v2_service_iam_member" "classifier_invoker" {
  location = google_cloud_run_v2_service.classifier.location
  name     = google_cloud_run_v2_service.classifier.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.classifier.email}"
}

resource "google_cloud_run_v2_service_iam_member" "personalization_invoker" {
  location = google_cloud_run_v2_service.personalization.location
  name     = google_cloud_run_v2_service.personalization.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.personalization.email}"
}

resource "google_cloud_run_v2_service_iam_member" "dispatcher_invoker" {
  location = google_cloud_run_v2_service.dispatcher.location
  name     = google_cloud_run_v2_service.dispatcher.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.dispatcher.email}"
}
