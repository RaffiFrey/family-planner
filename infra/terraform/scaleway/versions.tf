terraform {
  required_version = ">= 1.6"
  required_providers {
    scaleway = {
      source  = "scaleway/scaleway"
      version = "~> 2.50"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
  # Remote state in a Scaleway bucket (S3 backend); configure per environment with -backend-config.
  backend "s3" {}
}

provider "scaleway" {
  region     = var.region
  zone       = "${var.region}-1"
  project_id = var.project_id
}
