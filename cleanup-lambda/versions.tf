terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # S3 Remote State Backend
  backend "s3" {
    bucket         = "gameofthings-tfstate-1764447853"  # Your bucket name
    key            = "cleanup/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-lock"  # Optional: for state locking
  }
}
