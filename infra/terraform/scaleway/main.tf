locals {
  name    = "family-planer-${var.environment}"
  is_prod = var.environment == "production"
  api_url = "https://api.${var.domain}"
  web_url = "https://app.${var.domain}"
  adm_url = "https://admin.${var.domain}"
  tags    = ["family-planer", var.environment]
}

resource "scaleway_vpc_private_network" "main" {
  name = local.name
  tags = local.tags
}

# ---------------------------------------------------------------- PostgreSQL (managed, PITR backups)

resource "random_password" "db_owner" {
  length  = 32
  special = false
}

resource "random_password" "db_app" {
  length  = 32
  special = false
}

resource "random_password" "db_system" {
  length  = 32
  special = false
}

resource "scaleway_rdb_instance" "main" {
  name                      = local.name
  engine                    = "PostgreSQL-17"
  node_type                 = local.is_prod ? "DB-PRO2-XXS" : "DB-DEV-S"
  is_ha_cluster             = local.is_prod
  user_name                 = "fp"
  password                  = random_password.db_owner.result
  volume_type               = "sbs_5k"
  volume_size_in_gb         = local.is_prod ? 50 : 10
  encryption_at_rest        = true
  backup_schedule_frequency = 24
  backup_schedule_retention = local.is_prod ? 30 : 7
  backup_same_region        = false
  private_network {
    pn_id       = scaleway_vpc_private_network.main.id
    enable_ipam = true
  }
  tags = local.tags
}

resource "scaleway_rdb_database" "app" {
  instance_id = scaleway_rdb_instance.main.id
  name        = "family_planer"
}

# Runtime roles fp_app / fp_system are created by the migration job (packages/db/src/migrate.ts).

# ---------------------------------------------------------------- Redis

resource "random_password" "redis" {
  length  = 32
  special = false
}

resource "scaleway_redis_cluster" "main" {
  name         = local.name
  version      = "7.2.5"
  node_type    = local.is_prod ? "RED1-S" : "RED1-MICRO"
  user_name    = "fp"
  password     = random_password.redis.result
  cluster_size = 1
  tls_enabled  = true
  private_network {
    id = scaleway_vpc_private_network.main.id
  }
  tags = local.tags
}

# ---------------------------------------------------------------- Object storage (files, exports)

resource "scaleway_object_bucket" "files" {
  name = "${local.name}-files"
  versioning {
    enabled = true
  }
  lifecycle_rule {
    id      = "exports"
    prefix  = "exports/"
    enabled = true
    expiration {
      days = 7
    }
  }
  cors_rule {
    allowed_methods = ["GET", "PUT", "HEAD"]
    allowed_origins = [local.web_url]
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
  tags = { app = "family-planer", env = var.environment }
}

resource "scaleway_object_bucket_acl" "files" {
  bucket = scaleway_object_bucket.files.id
  acl    = "private"
}

resource "scaleway_iam_application" "storage" {
  name = "${local.name}-storage"
}

resource "scaleway_iam_policy" "storage" {
  name           = "${local.name}-storage"
  application_id = scaleway_iam_application.storage.id
  rule {
    project_ids          = [var.project_id]
    permission_set_names = ["ObjectStorageFullAccess"]
  }
}

resource "scaleway_iam_api_key" "storage" {
  application_id = scaleway_iam_application.storage.id
  description    = "Object storage access for the API"
}

# ---------------------------------------------------------------- Serverless containers

resource "scaleway_container_namespace" "main" {
  name = local.name
}

locals {
  database_host = scaleway_rdb_instance.main.private_network[0].ip
  redis_host    = tolist(scaleway_redis_cluster.main.private_network)[0].service_ips[0]
  common_env = {
    NODE_ENV            = "production"
    API_PUBLIC_URL      = local.api_url
    WEB_URL             = local.web_url
    ADMIN_URL           = local.adm_url
    S3_ENDPOINT         = "https://s3.${var.region}.scw.cloud"
    S3_REGION           = var.region
    S3_BUCKET           = scaleway_object_bucket.files.name
    S3_FORCE_PATH_STYLE = "false"
    LOG_LEVEL           = "info"
  }
  common_secrets = merge(var.secrets, {
    DATABASE_URL         = "postgres://fp_app:${random_password.db_app.result}@${local.database_host}:5432/family_planer"
    DATABASE_SYSTEM_URL  = "postgres://fp_system:${random_password.db_system.result}@${local.database_host}:5432/family_planer"
    REDIS_URL            = "rediss://fp:${random_password.redis.result}@${local.redis_host}:6379"
    S3_ACCESS_KEY_ID     = scaleway_iam_api_key.storage.access_key
    S3_SECRET_ACCESS_KEY = scaleway_iam_api_key.storage.secret_key
  })
}

resource "scaleway_container" "api" {
  name                         = "api"
  namespace_id                 = scaleway_container_namespace.main.id
  registry_image               = "${var.image_registry}/api:${var.image_tag}"
  port                         = 4000
  cpu_limit                    = 1000
  memory_limit_bytes           = 1073741824
  min_scale                    = local.is_prod ? 2 : 1
  max_scale                    = local.is_prod ? 10 : 2
  privacy                      = "public"
  protocol                     = "http1"
  environment_variables        = merge(local.common_env, { RUN_WORKERS = "false", API_PORT = "4000" })
  secret_environment_variables = local.common_secrets
  private_network_id           = scaleway_vpc_private_network.main.id
}

resource "scaleway_container" "worker" {
  name                         = "worker"
  namespace_id                 = scaleway_container_namespace.main.id
  registry_image               = "${var.image_registry}/api:${var.image_tag}"
  command                      = ["node", "--enable-source-maps", "dist/worker.js"]
  cpu_limit                    = 1000
  memory_limit_bytes           = 2147483648
  min_scale                    = 1
  max_scale                    = local.is_prod ? 4 : 1
  privacy                      = "private"
  environment_variables        = local.common_env
  secret_environment_variables = local.common_secrets
  private_network_id           = scaleway_vpc_private_network.main.id
}

resource "scaleway_container" "web" {
  name           = "web"
  namespace_id   = scaleway_container_namespace.main.id
  registry_image = "${var.image_registry}/web:${var.image_tag}"
  port           = 3000
  min_scale      = local.is_prod ? 2 : 1
  max_scale      = local.is_prod ? 10 : 2
  privacy        = "public"
}

resource "scaleway_container" "admin" {
  name                  = "admin"
  namespace_id          = scaleway_container_namespace.main.id
  registry_image        = "${var.image_registry}/admin:${var.image_tag}"
  port                  = 3001
  min_scale             = 1
  max_scale             = 1
  privacy               = "public"
  environment_variables = { ADMIN_API_URL = local.api_url }
}

resource "scaleway_container_domain" "api" {
  container_id = scaleway_container.api.id
  hostname     = "api.${var.domain}"
}

resource "scaleway_container_domain" "web" {
  container_id = scaleway_container.web.id
  hostname     = "app.${var.domain}"
}

resource "scaleway_container_domain" "admin" {
  container_id = scaleway_container.admin.id
  hostname     = "admin.${var.domain}"
}
