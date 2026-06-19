output "project_id" {
  value = var.project_id
}

output "region" {
  value = var.region
}

output "gcs_raw_bucket" {
  value = google_storage_bucket.raw_documents.name
}

output "gcs_staging_bucket" {
  value = google_storage_bucket.staging_extracted.name
}

output "bq_dataset" {
  value = google_bigquery_dataset.pipeline.dataset_id
}

output "artifact_registry" {
  value = google_artifact_registry_repository.beaver.repository_id
}

output "cloud_run_services" {
  value = {
    dispatcher       = google_cloud_run_v2_service.dispatcher.name
    scraper          = google_cloud_run_v2_service.scraper.name
    analyzer         = google_cloud_run_v2_service.analyzer.name
    classifier       = google_cloud_run_v2_service.classifier.name
    personalization  = google_cloud_run_v2_service.personalization.name
  }
}
