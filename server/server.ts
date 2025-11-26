import express from "express";
import {v4 as uuidv4} from "uuid";
import cors from "cors";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  GetCommand
} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({region: "us-east-1"});
const ddb = DynamoDBDocumentClient.from(client);


const app = express();
app.use(express.json());
app.use(cors());

// Utility to create random 4-letter game ID
function randomGameId() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

app.post('/api/createGame', async (req, res) => {
  const gameId = randomGameId();
  const {name} = req.body;
  const createdAt = new Date().toISOString();

  await ddb.send(new PutCommand({
    TableName: 'Games',
    Item: {gameId, gameOwner: name, createdAt}
  }));

  res.json({gameId});
});

app.post('/api/games/:gameId/entries', async (req, res) => {
  const {gameId} = req.params;
  const {authorName, text} = req.body;
  const entryId = uuidv4();
  const createdAt = new Date().toISOString();
  const revealed = false;

  await ddb.send(new PutCommand({
    TableName: 'Entries',
    Item: {entryId, gameId, authorName, text, createdAt, revealed}
  }));


  res.json({entryId});
});

app.post('/api/games/:gameId/start', async (req, res) => {
  const {gameId} = req.params;
  const entries = await ddb.send(new QueryCommand({
    TableName: 'Entries',
    KeyConditionExpression: 'gameId = :g',
    ExpressionAttributeValues: {':g': gameId}
  }));

  for (const entry of entries.Items || []) {
    await ddb.send(new UpdateCommand({
      TableName: 'Entries',
      Key: {gameId: gameId, entryId: entry.entryId},
      UpdateExpression: 'set revealed = :r',
      ExpressionAttributeValues: {':r': true}
    }));
  }

  res.json({started: true});
});

app.get('/api/games/:gameId/entries', async (req, res) => {
  const {gameId} = req.params;
  console.log("gameId", gameId);
  const result = await ddb.send(new QueryCommand({
    TableName: 'Entries',
    KeyConditionExpression: 'gameId = :g',
    ExpressionAttributeValues: {':g': gameId}
  }));
  console.log("Query items:", result.Items);
  res.json(result.Items ?? []); // ⬅️ send array only
});

// Guess API
app.post('/api/games/:gameId/entries/:entryId/guess', async (req, res) => {
  const {gameId, entryId} = req.params;
  const {guesserName, guess} = req.body;

  const entryResult = await ddb.send(new GetCommand({
    TableName: 'Entries',
    Key: {entryId}
  }));
  const item = entryResult.Item;

  // const isCorrect = entryResult.Item.authorName === guess;
  // res.json({isCorrect});
});

app.listen(3001, () => console.log('API server on port 3001'));
