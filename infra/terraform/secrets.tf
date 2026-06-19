resource "google_secret_manager_secret" "llm_endpoint_url" {
  secret_id = "llm-endpoint-url"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "llm_api_key" {
  secret_id = "runpod-api-key"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "llm_endpoint_placeholder" {
  secret      = google_secret_manager_secret.llm_endpoint_url.id
  secret_data = "https://your-runpod-endpoint/v1/chat/completions"
}

resource "google_secret_manager_secret_version" "llm_api_key_placeholder" {
  secret      = google_secret_manager_secret.llm_api_key.id
  secret_data = "placeholder-replace-before-deploy"
}
