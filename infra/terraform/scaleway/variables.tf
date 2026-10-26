variable "project_id" {
  type        = string
  description = "Scaleway project id"
}

variable "region" {
  type        = string
  default     = "fr-par"
  description = "EU region (fr-par, nl-ams, pl-waw)"
}

variable "environment" {
  type        = string
  description = "staging | production"
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "The environment must be staging or production."
  }
}

variable "domain" {
  type        = string
  description = "Base domain, e.g. family-planer.app (api., app., admin. subdomains)"
}

variable "image_registry" {
  type        = string
  description = "Container registry prefix, e.g. rg.fr-par.scw.cloud/family-planer"
}

variable "image_tag" {
  type        = string
  description = "Image tag to deploy (git SHA)"
}

variable "secrets" {
  type        = map(string)
  sensitive   = true
  description = "BETTER_AUTH_SECRET, FIELD_ENCRYPTION_KEY, STRIPE_*, SMTP_URL, ANTHROPIC_API_KEY etc. Never commit."
}
