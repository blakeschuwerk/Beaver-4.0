variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment label (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "bq_dataset_id" {
  description = "BigQuery dataset ID"
  type        = string
  default     = "beaver_pipeline"
}

variable "gcs_raw_bucket" {
  type    = string
  default = "beaver-raw-documents"
}

variable "gcs_staging_bucket" {
  type    = string
  default = "beaver-staging-extracted"
}

variable "scheduler_cron" {
  description = "Cron schedule for dispatcher tick"
  type        = string
  default     = "0 */6 * * *"
}
