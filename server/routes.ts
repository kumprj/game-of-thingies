import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ddb } from './db';
import { GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const router = express.Router();

function randomGameId() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let result = "";
  for (let i = 0; i < 4; i++) {
    const index = Math.floor(Math.random() * letters.length);
    result += letters[index];
  }
  return result;
}

// Create Game
router.post('/createGame', async (req, res) => {
  const gameId = randomGameId();
  const { name, question } = req.body;
  const createdAt = new Date().toISOString();

  try {
    await ddb.send(new UpdateCommand({
      TableName: 'Games',
      Key: { gameId },
      UpdateExpression: 'SET #q = :q, #c = :c, gameOwner = :go',
      ExpressionAttributeNames: { '#q': 'question', '#c': 'createdAt' },
      ExpressionAttributeValues: {
        ':q': question || 'What is your favorite thing?',
        ':c': createdAt,
        ':go': name
      },
      ReturnValues: 'ALL_NEW'
    }));
    res.json({ gameId });
  } catch (error) {
    console.error('Create game failed:', error);
    res.status(500).json({ error: 'Failed to create game' });
  }
});

// Add Entry
router.post('/games/:gameId/entries', async (req, res) => {
  const { gameId } = req.params;
  const { authorName, text } = req.body;
  const entryId = uuidv4();
  const createdAt = new Date().toISOString();

  await ddb.send(new PutCommand({
    TableName: 'Entries',
    Item: { entryId, gameId, authorName, text, createdAt, revealed: false }
  }));

  // Socket emit
  const io = (req as any).io;
  io.to(gameId).emit("entriesUpdated");

  res.json({ entryId });
});

// Start Game
router.post('/games/:gameId/start', async (req, res) => {
  const { gameId } = req.params;
  try {
    const entries = await ddb.send(new QueryCommand({
      TableName: 'Entries',
      KeyConditionExpression: 'gameId = :g',
      ExpressionAttributeValues: {':g': gameId}
    }));

    const entryItems = entries.Items || [];
    const players = entryItems.map((e: any) => e.authorName)
        .filter((v: any, i: number, a: any[]) => a.indexOf(v) === i);
    const shuffled = players.sort(() => Math.random() - 0.5);

    await ddb.send(new UpdateCommand({
      TableName: 'Games',
      Key: { gameId },
      UpdateExpression: 'SET turnOrder = :to, started = :s',
      ExpressionAttributeValues: { ':to': shuffled, ':s': true }
    }));

    // Reveal entries
    for (const entry of entryItems) {
      await ddb.send(new UpdateCommand({
        TableName: 'Entries',
        Key: { gameId: gameId, entryId: entry.entryId },
        UpdateExpression: 'set revealed = :r',
        ExpressionAttributeValues: { ':r': true }
      }));
    }

    const io = (req as any).io;
    io.to(gameId).emit("gameStarted", { turnOrder: shuffled });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Start failed' });
  }
});

// Guess Logic
router.post('/games/:gameId/entries/:entryId/guess', async (req, res) => {
  const { gameId, entryId } = req.params;
  const { guesserName, guess } = req.body;
  const io = (req as any).io;

  try {
    const entryResult = await ddb.send(new GetCommand({
      TableName: 'Entries', Key: { gameId, entryId }
    }));
    const item = entryResult.Item;
    if (!item) return res.status(404).json({error: "Entry not found"});

    const isCorrect = item.authorName === guess;

    if (isCorrect) {
      // Mark Guessed
      await ddb.send(new UpdateCommand({
        TableName: 'Entries', Key: { gameId, entryId },
        UpdateExpression: 'SET guessed = :val', ExpressionAttributeValues: {':val': true}
      }));

      // Update Score
      await ddb.send(new UpdateCommand({
        TableName: 'Scores', Key: { gameId, playerName: guesserName },
        UpdateExpression: 'ADD score :inc', ExpressionAttributeValues: {':inc': 1}
      }));

      // Update Turn Order (Remove AUTHOR)
      const gameData = await ddb.send(new GetCommand({ TableName: 'Games', Key: { gameId } }));
      let turnOrder = gameData.Item?.turnOrder || [];
      turnOrder = turnOrder.filter((name: string) => name !== item.authorName);

      await ddb.send(new UpdateCommand({
        TableName: 'Games', Key: { gameId },
        UpdateExpression: 'SET turnOrder = :to', ExpressionAttributeValues: {':to': turnOrder}
      }));

      io.to(gameId).emit("scoreUpdated", { playerName: guesserName, authorName: item.authorName, guess: item.text });
      io.to(gameId).emit("nextTurn", { currentPlayer: turnOrder[0] || null, turnOrder });
      io.to(gameId).emit("entriesUpdated");

      return res.json({ isCorrect: true });
    } else {
      // Wrong Guess - Rotate
      const gameData = await ddb.send(new GetCommand({ TableName: 'Games', Key: { gameId } }));
      let turnOrder = gameData.Item?.turnOrder || [];
      if (turnOrder.length > 1) {
        const current = turnOrder.shift();
        turnOrder.push(current);
        await ddb.send(new UpdateCommand({
          TableName: 'Games', Key: { gameId },
          UpdateExpression: 'SET turnOrder = :to', ExpressionAttributeValues: {':to': turnOrder}
        }));
      }

      io.to(gameId).emit("wrongAnswer", {
        playerName: guesserName,
        authorName: item.authorName,
        guess: item.text
      });
      io.to(gameId).emit("nextTurn", { currentPlayer: turnOrder[0] || null, turnOrder });
      return res.json({ isCorrect: false });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Guess failed" });
  }
});

// ... Add the other GET routes (get game, get entries, get scores) here ...
// They follow the same pattern: fetch from DDB, return JSON.
router.get('/games/:gameId', async (req, res) => {
  const { gameId } = req.params;
  const result = await ddb.send(new GetCommand({ TableName: 'Games', Key: { gameId } }));
  res.json(result.Item || {});
});

router.get('/games/:gameId/entries', async (req, res) => {
  const { gameId } = req.params;
  const result = await ddb.send(new QueryCommand({
    TableName: 'Entries',
    KeyConditionExpression: 'gameId = :g',
    ExpressionAttributeValues: {':g': gameId}
  }));
  res.json(result.Items || []);
});

router.get('/games/:gameId/scores', async (req, res) => {
  const { gameId } = req.params;
  const result = await ddb.send(new QueryCommand({
    TableName: 'Scores',
    KeyConditionExpression: 'gameId = :g',
    ExpressionAttributeValues: {':g': gameId}
  }));
  res.json(result.Items || []);
});

// Reset Game
router.post('/games/:gameId/reset', async (req, res) => {
  const { gameId } = req.params;
  const { question } = req.body;

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

    // 2. Reset Game state
    await ddb.send(new UpdateCommand({
      TableName: 'Games',
      Key: { gameId },
      UpdateExpression: 'SET question = :q, createdAt = :c, started = :started',
      ExpressionAttributeValues: {
        ':q': question?.trim() || 'What is your favorite thing?',
        ':c': new Date().toISOString(),
        ':started': false
      },
      ReturnValues: 'ALL_NEW'
    }));

    // 3. Emit Reset Event
    const io = (req as any).io;
    io.to(gameId).emit("gameReset");

    res.json({ success: true, message: 'Game reset with fresh slate' });
  } catch (error) {
    console.error('Reset error:', error);
    res.status(500).json({ error: 'Failed to reset game' });
  }
});


export default router;
