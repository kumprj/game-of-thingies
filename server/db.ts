import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

/**
 * Initializes a DynamoDB client to interact with the AWS DynamoDB service.
 * Credentials come from the container's task role when deployed, and from `npx sst dev` locally.
 * DYNAMODB_ENDPOINT points it at DynamoDB Local for the integration tests; it's unset elsewhere.
 */
const client = new DynamoDBClient({ region: "us-east-1", endpoint: process.env.DYNAMODB_ENDPOINT });

/**
 * Creates a DynamoDB Document Client from the base DynamoDB client.
 * The Document Client simplifies working with DynamoDB by abstracting away
 * the need to manually convert data to and from DynamoDB's native format.
 */
export const ddb = DynamoDBDocumentClient.from(client);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Run the server with \`npx sst dev\`.`);
  return value;
}

/**
 * Table names for the current SST stage, set by sst.config.ts. Production uses the original
 * Games / Entries / Scores tables; every other stage has its own, so a local server can never
 * write to production's by accident.
 */
export const tables = {
  games: requireEnv("GAMES_TABLE"),
  entries: requireEnv("ENTRIES_TABLE"),
  scores: requireEnv("SCORES_TABLE"),
};
