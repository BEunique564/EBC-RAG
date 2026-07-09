# EBC Legal AI — AWS Terraform
# Yeh file poora infrastructure banati hai: VPC, ECS, RDS, OpenSearch, Redis, S3, ALB
#
# Kaise use karein:
#   1. AWS account banao (agar nahi hai)
#   2. aws configure karo (access key + secret key)
#   3. terraform init
#   4. terraform apply
#   5. 10-15 min wait karo → sab ban jayega

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" {
  region = var.aws_region
}

# ============================================================
# Networking
# ============================================================

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = { Name = "ebc-ai-${var.environment}" }
}

resource "aws_subnet" "public" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
  tags = { Name = "ebc-ai-public-${count.index}" }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index + 100}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]
  tags = { Name = "ebc-ai-private-${count.index}" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "ebc-ai-igw" }
}

resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "ebc-ai-nat-eip" }
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  tags          = { Name = "ebc-ai-nat" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = { Name = "ebc-ai-public-rt" }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }
  tags = { Name = "ebc-ai-private-rt" }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

resource "aws_security_group" "alb" {
  name        = "ebc-ai-alb"
  description = "ALB security group"
  vpc_id      = aws_vpc.main.id
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "ecs" {
  name        = "ebc-ai-ecs"
  description = "ECS tasks security group"
  vpc_id      = aws_vpc.main.id
  ingress {
    from_port       = 5174
    to_port         = 5174
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "redis" {
  name        = "ebc-ai-redis"
  description = "Redis security group"
  vpc_id      = aws_vpc.main.id
  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }
}

resource "aws_security_group" "postgres" {
  name        = "ebc-ai-postgres"
  description = "PostgreSQL security group"
  vpc_id      = aws_vpc.main.id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

# ============================================================
# S3 Buckets
# ============================================================

resource "aws_s3_bucket" "raw" {
  bucket = "ebc-ai-raw-${var.environment}-${data.aws_caller_identity.current.account_id}"
  tags   = { Name = "EBC AI Raw Data" }
}

resource "aws_s3_bucket_versioning" "raw" {
  bucket = aws_s3_bucket.raw.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket" "cleaned" {
  bucket = "ebc-ai-cleaned-${var.environment}-${data.aws_caller_identity.current.account_id}"
  tags   = { Name = "EBC AI Cleaned Data" }
}

resource "aws_s3_bucket" "embeddings" {
  bucket = "ebc-ai-embeddings-${var.environment}-${data.aws_caller_identity.current.account_id}"
  tags   = { Name = "EBC AI Embeddings" }
}

resource "aws_s3_bucket_lifecycle_configuration" "raw" {
  bucket = aws_s3_bucket.raw.id
  rule {
    id     = "archive-to-glacier"
    status = "Enabled"
    transition {
      days          = 90
      storage_class = "GLACIER"
    }
    expiration {
      days = 2555
    }
  }
}

data "aws_caller_identity" "current" {}

# ============================================================
# ElastiCache Redis
# ============================================================

resource "aws_elasticache_subnet_group" "main" {
  name       = "ebc-ai-redis"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_elasticache_cluster" "main" {
  cluster_id           = "ebc-ai-redis-${var.environment}"
  engine               = "redis"
  node_type            = var.redis_node_type
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.redis.id]
  tags                 = { Name = "ebc-ai-redis" }
}

# ============================================================
# RDS PostgreSQL
# ============================================================

resource "aws_db_subnet_group" "main" {
  name       = "ebc-ai-postgres"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_instance" "main" {
  identifier             = "ebc-ai-${var.environment}"
  engine                 = "postgres"
  engine_version         = "16.3"
  instance_class         = var.rds_instance_class
  allocated_storage      = 100
  storage_type           = "gp3"
  db_name                = "ebc_legal_ai"
  username               = "ebc_admin"
  password               = random_password.rds.result
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.postgres.id]
  skip_final_snapshot    = var.environment != "production"
  backup_retention_period = var.environment == "production" ? 30 : 7
  multi_az               = var.environment == "production"
  tags                   = { Name = "ebc-ai-postgres" }
}

resource "random_password" "rds" {
  length  = 24
  special = false
}

# ============================================================
# ECS Cluster + Task Definition + Service
# ============================================================

resource "aws_ecs_cluster" "main" {
  name = "ebc-ai-${var.environment}"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "ebc-ai-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "1024"
  memory                   = "2048"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = "${aws_ecr_repository.api.repository_url}:latest"
      essential = true
      portMappings = [{ containerPort = 5174, protocol = "tcp" }]
      environment = [
        { name = "NODE_ENV",      value = "production" },
        { name = "PORT",          value = "5174" },
        { name = "REDIS_URL",     value = "redis://${aws_elasticache_cluster.main.cache_nodes[0].address}:6379" },
        { name = "PG_HOST",       value = aws_db_instance.main.address },
        { name = "PG_DATABASE",   value = aws_db_instance.main.db_name },
        { name = "PG_USER",       value = aws_db_instance.main.username },
        { name = "PG_PASSWORD",   value = random_password.rds.result },
        { name = "S3_RAW_BUCKET", value = aws_s3_bucket.raw.id },
        { name = "LOG_LEVEL",     value = "info" },
        { name = "LOG_JSON",      value = "true" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.api.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "api" {
  name            = "ebc-ai-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = 2
  launch_type     = "FARGATE"
  network_configuration {
    subnets         = aws_subnet.private[*].id
    security_groups = [aws_security_group.ecs.id]
    assign_public_ip = false
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 5174
  }
  depends_on = [aws_lb_listener.api]
}

resource "aws_appautoscaling_target" "api" {
  max_capacity       = 10
  min_capacity       = 2
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "ebc-ai-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = 70
  }
}

# ============================================================
# ECR (Docker image store)
# ============================================================

resource "aws_ecr_repository" "api" {
  name = "ebc-ai-api"
  image_scanning_configuration { scan_on_push = true }
}

# ============================================================
# ALB (Load Balancer)
# ============================================================

resource "aws_lb" "api" {
  name               = "ebc-ai-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
  tags               = { Name = "ebc-ai-alb" }
}

resource "aws_lb_target_group" "api" {
  name        = "ebc-ai-tg"
  port        = 5174
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"
  health_check {
    path                = "/api/health"
    interval            = 30
    timeout             = 10
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "api" {
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = aws_acm_certificate.api.arn
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_lb_listener" "api_http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ============================================================
# ACM Certificate (HTTPS)
# ============================================================

resource "aws_acm_certificate" "api" {
  domain_name       = var.domain_name
  validation_method = "DNS"
}

# ============================================================
# WAF (Web Application Firewall)
# ============================================================

resource "aws_wafv2_web_acl" "api" {
  name        = "ebc-ai-waf"
  description = "WAF for EBC Legal AI API"
  scope       = "REGIONAL"

  default_action { allow {} }

  rule {
    name     = "rate-limit"
    priority = 1
    action   = { block {} }
    statement {
      rate_based_statement {
        limit              = 100
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimit"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "xss-block"
    priority = 2
    action   = { block {} }
    statement {
      xss_match_statement {
        field_to_match { query_string {} }
        text_transformation { priority = 1; type = "URL_DECODE" }
        text_transformation { priority = 2; type = "HTML_ENTITY_DECODE" }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "XssBlock"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "EbcAiWaf"
    sampled_requests_enabled   = true
  }
}

resource "aws_wafv2_web_acl_association" "api" {
  resource_arn = aws_lb.api.arn
  web_acl_arn  = aws_wafv2_web_acl.api.arn
}

# ============================================================
# IAM Roles
# ============================================================

resource "aws_iam_role" "ecs_execution" {
  name = "ebc-ai-ecs-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "ecs_task" {
  name = "ebc-ai-ecs-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "ecs_task_s3" {
  name = "ebc-ai-s3-access"
  role = aws_iam_role.ecs_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:ListBucket"]
        Resource = [
          aws_s3_bucket.raw.arn,
          "${aws_s3_bucket.raw.arn}/*",
          aws_s3_bucket.cleaned.arn,
          "${aws_s3_bucket.cleaned.arn}/*",
          aws_s3_bucket.embeddings.arn,
          "${aws_s3_bucket.embeddings.arn}/*"
        ]
      }
    ]
  })
}

# ============================================================
# CloudWatch Logs
# ============================================================

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/ebc-ai-api"
  retention_in_days = 90
}

# ============================================================
# Route53 (DNS)
# ============================================================

resource "aws_route53_record" "api" {
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"
  alias {
    name                   = aws_lb.api.dns_name
    zone_id                = aws_lb.api.zone_id
    evaluate_target_health = true
  }
}

# ============================================================
# Outputs
# ============================================================

output "api_url" {
  value = "https://${var.domain_name}"
}

output "load_balancer_dns" {
  value = aws_lb.api.dns_name
}

output "redis_endpoint" {
  value = aws_elasticache_cluster.main.cache_nodes[0].address
}

output "rds_endpoint" {
  value = aws_db_instance.main.address
}

output "ecr_repository" {
  value = aws_ecr_repository.api.repository_url
}

output "s3_raw_bucket" {
  value = aws_s3_bucket.raw.id
}
