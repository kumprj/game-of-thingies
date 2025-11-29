provider "aws" {
  region = "us-east-1"  # Update as needed
}

# Lambda execution role
resource "aws_iam_role" "cleanup_role" {
  name = "gameofthings-cleanup-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

# IAM policy for DynamoDB cleanup
resource "aws_iam_role_policy" "cleanup_policy" {
  name = "gameofthings-cleanup-policy"
  role = aws_iam_role.cleanup_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:Scan",
        "dynamodb:DeleteItem"
      ]
      Resource = "arn:aws:dynamodb:us-east-1:875660052076:table/Games"  # Update ARN
    }, {
      Effect = "Allow"
      Action = [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ]
      Resource = "arn:aws:logs:*:*:*"
    }]
  })
}

# Lambda function
data "archive_file" "cleanup_zip" {
  type        = "zip"
  output_path = "cleanup_games.zip"

  source {
    content  = file("${path.module}/cleanup_games/lambda_function.py")
    filename = "lambda_function.py"
  }
}

resource "aws_lambda_function" "cleanup_games" {
  filename         = data.archive_file.cleanup_zip.output_path
  function_name    = "gameofthings-cleanup-old-games"
  role             = aws_iam_role.cleanup_role.arn
  handler          = "lambda_function.lambda_handler"
  runtime          = "python3.12"
  source_code_hash = data.archive_file.cleanup_zip.output_base64sha256

  environment {
    variables = {
      DYNAMODB_TABLE = "Games"
    }
  }

  timeout = 30
}

# CloudWatch Event Rule (daily at 2AM UTC)
resource "aws_cloudwatch_event_rule" "cleanup_schedule" {
  name                = "gameofthings-daily-cleanup"
  schedule_expression = "cron(0 2 * * ? *)"  # 2AM UTC daily
  description         = "Daily cleanup of Games older than 48 hours"
}

# Event Target
resource "aws_cloudwatch_event_target" "cleanup_target" {
  rule      = aws_cloudwatch_event_rule.cleanup_schedule.name
  target_id = "cleanup-games-target"
  arn       = aws_lambda_function.cleanup_games.arn
}

# Lambda permission for CloudWatch
resource "aws_lambda_permission" "allow_cloudwatch" {
  statement_id       = "AllowExecutionFromCloudWatch"
  action             = "lambda:InvokeFunction"
  function_name      = aws_lambda_function.cleanup_games.function_name
  principal          = "events.amazonaws.com"
  source_arn         = aws_cloudwatch_event_rule.cleanup_schedule.arn
}

output "cleanup_lambda_arn" {
  value = aws_lambda_function.cleanup_games.arn
}
