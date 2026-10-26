output "database_endpoint" {
  value = "${local.database_host}:5432"
}

output "migration_url" {
  value       = "postgres://fp:${random_password.db_owner.result}@${local.database_host}:5432/family_planer"
  sensitive   = true
  description = "Owner connection for the migration job (DATABASE_MIGRATION_URL)"
}

output "db_runtime_passwords" {
  value = {
    DB_APP_PASSWORD    = random_password.db_app.result
    DB_SYSTEM_PASSWORD = random_password.db_system.result
  }
  sensitive = true
}

output "bucket" {
  value = scaleway_object_bucket.files.name
}

output "container_urls" {
  value = {
    api   = scaleway_container_domain.api.hostname
    web   = scaleway_container_domain.web.hostname
    admin = scaleway_container_domain.admin.hostname
  }
}
