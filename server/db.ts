import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

// Ensure your AWS credentials are set in environment variables or ~/.aws/credentials
const client = new DynamoDBClient({ region: "us-east-1" });

export const ddb = DynamoDBDocumentClient.from(client);
