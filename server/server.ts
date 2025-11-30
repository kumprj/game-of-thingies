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

  try {
    await ddb.send(new UpdateCommand({
      TableName: 'Games',
      Key: {gameId},
      UpdateExpression: 'SET #q = :q, #c = :c, gameOwner = :go',
      ExpressionAttributeNames: {
        '#q': 'question',
        '#c': 'createdAt'
      },
      ExpressionAttributeValues: {
        ':q': question || 'What is your favorite thing?',
        ':c': createdAt,
        ':go': name  // Sets gameOwner on first create
      },
      ReturnValues: 'ALL_NEW'
    }));

    res.json({gameId});
  } catch (error) {
    console.error('Create game failed:', error);
    res.status(500).json({error: 'Failed to create game'});
  }
});

app.post('/api/games/:gameId/start', async (req, res) => {
  const {gameId} = req.params;

  try {
    const result = await ddb.send(new UpdateCommand({
      TableName: 'Games',
      Key: {gameId},
      UpdateExpression: 'SET started = :s',
      ConditionExpression: 'attribute_not_exists(started) OR started = :f',
      ExpressionAttributeValues: {
        ':s': true,
        ':f': false
      },
      ReturnValues: 'ALL_NEW'
    }));
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

    res.json({success: true});
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') {
      // Game already started - force frontend refresh
      res.status(409).json({
        error: 'GAME_ALREADY_STARTED',
        message: 'Game has already started by another player!'
      });
    } else {
      res.status(500).json({error: 'Failed to start game'});
    }
  }
});

app.post('/api/games/:gameId/reset', async (req, res) => {
  const {gameId} = req.params;
  const {question} = req.body;

  try {
    // 1. DELETE ALL existing entries
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
    console.log(`🗑️ Deleted ${deletePromises.length} old entries`);

    // 2. Reset game question
    await ddb.send(new UpdateCommand({
      TableName: 'Games',
      Key: {gameId},
      UpdateExpression: 'SET question = :q, createdAt = :c, started = :started',
      ExpressionAttributeValues: {
        ':q': question?.trim() || 'What is your favorite thing?',
        ':c': new Date().toISOString(),
        ':started': false
      },
      ReturnValues: 'ALL_NEW'
    }));

    // 3. RESET roundPoints for ALL players (Query + BatchUpdate)
    const playersData = await ddb.send(new QueryCommand({
      TableName: 'Players',
      KeyConditionExpression: 'gameId = :g AND begins_with(playerSortKey, :prefix)',
      ExpressionAttributeValues: {
        ':g': gameId,
        ':prefix': 'PLAYER#'
      }
    }));

    const playerResetPromises = (playersData.Items || []).map(player =>
        ddb.send(new UpdateCommand({
          TableName: 'Players',
          Key: {
            gameId: player.gameId,
            playerSortKey: player.playerSortKey
          },
          UpdateExpression: 'SET roundPoints = :zero',
          ExpressionAttributeValues: {':zero': 0}
        }))
    );
    await Promise.all(playerResetPromises);
    console.log(`🔄 Reset ${playerResetPromises.length} players' round points`);

    res.json({success: true, message: 'Game reset successfully!'});
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


app.post('/api/games/:gameId/entries', async (req, res) => {
  const {gameId} = req.params;
  const {authorName, text} = req.body;
  console.log('got here1');
  try {
    // 1. Track player entry submission
    await ddb.send(new UpdateCommand({
      TableName: 'Players',
      Key: {
        gameId,
        playerSortKey: `PLAYER#${authorName}`
      },
      UpdateExpression: 'SET entriesSubmitted = if_not_exists(entriesSubmitted, :zero) + :one',
      ExpressionAttributeValues: {':zero': 0, ':one': 1}
    }));
    console.log('got here2');
    // 2. CREATE NEW ENTRY (missing piece!)
    const entryId = `${gameId}#${Date.now()}`; // Simple unique ID
    await ddb.send(new PutCommand({
      TableName: 'Entries',
      Item: {
        gameId,
        entryId,
        authorName,
        text,
        createdAt: new Date().toISOString(),
        revealed: false,
        guessed: false
      }
    }));
    console.log('got here3');
    // 3. Return ALL entries for this game
    const result = await ddb.send(new QueryCommand({
      TableName: 'Entries',
      KeyConditionExpression: 'gameId = :g',
      ExpressionAttributeValues: {':g': gameId}
    }));
    console.log("Created entry, total entries:", result.Items?.length);
    res.json(result.Items ?? []);
  } catch (error) {
    console.error("Entry creation failed:", error);
    res.status(500).json({error: 'Failed to create entry'});
  }
});


app.post('/api/games/:gameId/entries/:entryId/guess', async (req, res) => {
  console.log('🎯 ROUTE HIT:', req.params, req.body);  // DEBUG
  const {gameId, entryId} = req.params;
  const {authorName, guess} = req.body;

  console.log(`🎯 GUESS REQUEST: gameId=${gameId}, entryId=${entryId}, authorName=${authorName}, guess=${guess}`);

  try {
    // DEBUG: Log exact Key being queried
    const lookupKey = {gameId, entryId};
    console.log('🔍 Looking up Key:', JSON.stringify(lookupKey));

    // Get the entry
    const entryResult = await ddb.send(new GetCommand({
      TableName: 'Entries',
      Key: lookupKey
    }));

    console.log('📋 Entry result:', entryResult.Item ? 'FOUND' : 'NOT FOUND');

    const item = entryResult.Item;
    if (!item) {
      console.log('❌ Entry not found in DB with key:', lookupKey);
      return res.status(404).json({error: "Entry not found"});
    }

    console.log('✅ Entry found:', item.authorName, item.text);

    const isCorrect = item.authorName === guess;
    console.log('🎲 isCorrect:', isCorrect);

    if (isCorrect) {
      // Mark as guessed
      console.log(`🏆 Awarded point to PLAYER#${authorName} in game ${gameId}`);
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

      // Increment player pts
      await ddb.send(new UpdateCommand({
        TableName: 'Players',
        Key: {
          gameId,
          playerSortKey: `PLAYER#${authorName}`
        },
        UpdateExpression: `
      SET 
        roundPoints = if_not_exists(roundPoints, :zero) + :one,
        totalPoints = if_not_exists(totalPoints, :zero) + :one,
        correctGuesses = if_not_exists(correctGuesses, :zero) + :one
    `,
        ExpressionAttributeValues: {':zero': 0, ':one': 1}
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

app.get('/api/games/:gameId/players', async (req, res) => {
  const {gameId} = req.params;

  try {
    const result = await ddb.send(new QueryCommand({
      TableName: 'Players',
      KeyConditionExpression: 'gameId = :gameId AND begins_with(playerSortKey, :prefix)',
      ExpressionAttributeValues: {
        ':gameId': gameId,
        ':prefix': 'PLAYER#'
      },
      ProjectionExpression: 'playerSortKey, roundPoints, totalPoints, correctGuesses, entriesSubmitted'
    }));

    // 🆕 FIX: Properly extract player names
    const players = (result.Items || []).map(item => ({
      name: item.playerSortKey.replace('PLAYER#', ''),  // "PLAYER#Robbie" → "Robbie"
      roundPoints: Number(item.roundPoints) || 0,
      totalPoints: Number(item.totalPoints) || 0,
      correctGuesses: Number(item.correctGuesses) || 0,
      entriesSubmitted: Number(item.entriesSubmitted) || 0
    })).filter(player => player.name);  // Remove undefined names

    // Sort by roundPoints (descending)
    const sortedPlayers = players.sort((a, b) => b.roundPoints - a.roundPoints);

    console.log(`📊 Leaderboard for ${gameId}:`, sortedPlayers.map(p => `${p.name}: ${p.roundPoints}`));
    res.json(sortedPlayers);
  } catch (error) {
    console.error('Players query error:', error);
    res.status(500).json({error: 'Failed to fetch leaderboard'});
  }
});


app.listen(3001, () => console.log('API server on port 3001'));
export const handler = serverless(app);