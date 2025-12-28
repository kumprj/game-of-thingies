import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

/**
 * Initializes a DynamoDB client to interact with the AWS DynamoDB service.
 * Ensure that AWS credentials are properly configured in environment variables or ~/.aws/credentials.
 */
const client = new DynamoDBClient({ region: "us-east-1" });

/**
 * Creates a DynamoDB Document Client from the base DynamoDB client.
 * The Document Client simplifies working with DynamoDB by abstracting away
 * the need to manually convert data to and from DynamoDB's native format.
 */
export const ddb = DynamoDBDocumentClient.from(client);