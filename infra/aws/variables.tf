variable "aws_region" {
  description = "AWS region (ap-south-1 = Mumbai, best for India)"
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Environment name: dev, staging, production"
  type        = string
  default     = "production"
}

variable "domain_name" {
  description = "Tumhara domain name (e.g., ai.ebc.co.in). Agar nahi hai toh ALB DNS se kaam chalega"
  type        = string
  default     = "ai.ebc.co.in"
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID (domain ka DNS management). EBC team se pucho"
  type        = string
  default     = ""
}

variable "redis_node_type" {
  description = "Redis instance type. cache.t3.micro free tier me aata hai, production me cache.r6g.large"
  type        = string
  default     = "cache.t3.micro"
}

variable "rds_instance_class" {
  description = "RDS instance type. db.t3.medium free tier, production me db.r6g.2xlarge"
  type        = string
  default     = "db.t3.medium"
}
