import express from "express";
import {v4 as uuidv4} from "uuid";
import cors from "cors";
import serverless from 'serverless-http';
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand
} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({region: "us-east-1"});
const ddb = DynamoDBDocumentClient.from(client);
const app = express();

app.use(express.json());     // Parses JSON bodies
// app.use(express.urlencoded({ extended: true }));  // Parses URL-encoded bodies
app.use(cors());
app.use((req, res, next) => {
  console.log('Incoming request:', req.method, req.url);
  next();
});

function randomGameId() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let result = "";
  for (let i = 0; i < 4; i++) {
    const index = Math.floor(Math.random() * letters.length);
    result += letters[index];
  }
  return result;
}

app.post('/api/createGame', async (req, res) => {
  const gameId = randomGameId();
  const {name, question} = req.body;
  const createdAt = new Date().toISOString();

  await ddb.send(new UpdateCommand({
    TableName: 'Games',
    Key: {gameId},
    UpdateExpression: 'SET question = :q, createdAt = :c',
    ExpressionAttributeValues: {
      ':q': question || 'What is your favorite thing?',
      ':c': createdAt
    },
    ReturnValues: 'ALL_NEW'
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
  const { gameId } = req.params;

  try {
    const result = await ddb.send(new UpdateCommand({
      TableName: 'Games',
      Key: { gameId },
      UpdateExpression: 'SET started = :s',
      ConditionExpression: 'attribute_not_exists(started) OR started = :f',
      ExpressionAttributeValues: {
        ':s': true,
        ':f': false
      },
      ReturnValues: 'ALL_NEW'
    }));

    res.json({ success: true });
  } catch (error) {
    if (error === 'ConditionalCheckFailedException') {
      // Game already started - force frontend refresh
      res.status(409).json({
        error: 'GAME_ALREADY_STARTED',
        message: 'Game has already started by another player!'
      });
    } else {
      res.status(500).json({ error: 'Failed to start game' });
    }
  }
});

app.post('/api/games/:gameId/reset', async (req, res) => {
  const {gameId} = req.params;
  const {question} = req.body;

  try {
    // 1. DELETE ALL existing entries for this game
    const entriesData = await ddb.send(new QueryCommand({
      TableName: 'Entries',
      KeyConditionExpression: 'gameId = :g',
      ExpressionAttributeValues: {':g': gameId}
    }));

    const deletePromises = (entriesData.Items || []).map(entry =>
        ddb.send(new DeleteCommand({
          TableName: 'Entries',
          Key: {gameId: entry.gameId, entryId: entry.entryId}
        }))
    );
    await Promise.all(deletePromises);
    console.log(`Deleted ${deletePromises.length} old entries`);

    await ddb.send(new UpdateCommand({
      TableName: 'Games',
      Key: {gameId},
      UpdateExpression: 'SET question = :q, createdAt = :c, gameOwner = gameOwner',
      ExpressionAttributeValues: {
        ':q': question?.trim() || 'What is your favorite thing?',
        ':c': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    }));


    res.json({success: true, message: 'Game reset with fresh slate'});
  } catch (error) {
    console.error('Reset error:', error);
    res.status(500).json({error: 'Failed to reset game'});
  }
});


app.get('/api/games/:gameId', async (req, res) => {
  console.log("got here")
  console.log('req.params:', req.params);
  const {gameId} = req.params;
  console.log('Fetching game for gameId:', gameId);


  try {
    const result = await ddb.send(new GetCommand({
      TableName: 'Games',
      Key: {gameId}
    }));
    console.log("Result is ", result);
    if (!result.Item) return res.status(404).json({error: 'Game not found'});
    res.json(result.Item);
  } catch (error) {
    console.error('Error fetching game:', error);
    console.log("gameId is", gameId);
    res.status(500).json({error: 'Internal Server Error'});
  }
});


app.get('/api/games/:gameId/entries', async (req, res) => {
  const {gameId} = req.params;
  const result = await ddb.send(new QueryCommand({
    TableName: 'Entries',
    KeyConditionExpression: 'gameId = :g',
    ExpressionAttributeValues: {':g': gameId}
  }));
  console.log("Query items:", result.Items);
  res.json(result.Items ?? []); // ⬅️ send array only
});

app.post('/api/games/:gameId/entries/:entryId/guess', async (req, res) => {
  const {gameId, entryId} = req.params;
  const {guesserName, guess} = req.body;

  try {
    // Get the entry
    const entryResult = await ddb.send(new GetCommand({
      TableName: 'Entries',
      Key: {gameId, entryId}
    }));

    const item = entryResult.Item;
    if (!item) {
      return res.status(404).json({error: "Entry not found"});
    }

    const isCorrect = item.authorName === guess;

    if (isCorrect) {
      // Mark as guessed
      await ddb.send(new UpdateCommand({
        TableName: 'Entries',
        Key: {gameId, entryId},
        UpdateExpression: 'SET guessed = :val',
        ExpressionAttributeValues: {':val': true}
      }));

      // Fetch the updated item
      const updatedEntryResult = await ddb.send(new GetCommand({
        TableName: 'Entries',
        Key: {gameId, entryId}
      }));

      return res.json({
        isCorrect,
        entry: updatedEntryResult.Item
      });
    }

    res.json({isCorrect});
  } catch (err) {
    console.error("Guess API error:", err);
    res.status(500).json({error: "Internal Server Error"});
  }
});

// app.listen(3001, () => console.log('API server on port 3001'));
export const handler = serverless(app);