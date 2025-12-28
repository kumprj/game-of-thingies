import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ddb } from './db';
import { GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const router = express.Router();

/**
 * Generates a random 4-letter game ID using uppercase letters.
 * @returns {string} A randomly generated game ID.
 */
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
/**
 * Endpoint to create a new game.
 * Generates a unique game ID and stores the game details in the database.
 *
 * @route POST /createGame
 * @body {string} name - The name of the game owner.
 * @body {string} question - The initial question for the game.
 * @returns {Object} JSON response containing the game ID.
 */
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
/**
 * Endpoint to add a new entry to a game.
 * Stores the entry details in the database and notifies clients via WebSocket.
 *
 * @route POST /games/:gameId/entries
 * @param {string} gameId - The ID of the game.
 * @body {string} authorName - The name of the entry author.
 * @body {string} text - The text of the entry.
 * @returns {Object} JSON response containing the entry ID.
 */
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
/**
 * Endpoint to start a game.
 * Shuffles the turn order, updates the game state, and reveals all entries.
 *
 * @route POST /games/:gameId/start
 * @param {string} gameId - The ID of the game.
 * @returns {Object} JSON response indicating success.
 */
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

export default router;