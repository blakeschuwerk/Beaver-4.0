# Firestore is provisioned at project level; collections are created on first write.
# Indexes for common query patterns.

resource "google_firestore_index" "counties_broken" {
  project    = var.project_id
  collection = "counties"

  fields {
    field_path = "broken"
    order      = "ASCENDING"
  }
  fields {
    field_path = "updated_at"
    order      = "DESCENDING"
  }
}

resource "google_firestore_index" "user_profiles_geography" {
  project    = var.project_id
  collection = "user_profiles"

  fields {
    field_path = "geography"
    array_config = "CONTAINS"
  }
}
