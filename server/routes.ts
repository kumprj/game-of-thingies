import {timingSafeEqual} from 'crypto';
import express from 'express';
import {v4 as uuidv4} from 'uuid';
import {ddb, expiresAt, tables} from './db';
import {buildTurnOrder} from './turnOrder';
import {validateGameSetup} from './gameSetup';
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand
} from "@aws-sdk/lib-dynamodb";

const router = express.Router();
const MAX_CODE_ATTEMPTS = 10;

async function getGame(gameId: string) {
  const result = await ddb.send(new GetCommand({TableName: tables.games, Key: {gameId}}));
  return result.Item;
}

/** True when the request's x-host-token header matches the game's stored host token. */
function isHost(game: Record<string, any> | undefined, req: express.Request) {
  const stored = game?.hostToken;
  const given = req.header('x-host-token');
  if (typeof stored !== 'string' || typeof given !== 'string') return false;
  const a = Buffer.from(stored);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

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
  const setup = validateGameSetup(req.body);
  if (!setup.ok) return res.status(400).json({error: setup.error});
  const {name, question} = setup;
  const createdAt = new Date().toISOString();
  const hostToken = uuidv4();

  try {
    // A random code can collide with a live game; never overwrite it, pick a new code instead
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const gameId = randomGameId();
      try {
        await ddb.send(new PutCommand({
          TableName: tables.games,
          Item: {
            gameId,
            question,
            createdAt,
            gameOwner: name,
            hostToken,
            expiresAt: expiresAt()
          },
          ConditionExpression: 'attribute_not_exists(gameId)'
        }));
        return res.json({gameId, hostToken});
      } catch (error) {
        if ((error as {name?: string}).name !== 'ConditionalCheckFailedException') throw error;
      }
    }
    throw new Error(`No free game code after ${MAX_CODE_ATTEMPTS} attempts`);
  } catch (error) {
    console.error('Create game failed:', error);
    res.status(500).json({error: 'Failed to create game'});
  }
});

// Add Entry. Names are unique within a game (case-insensitive); a duplicate is rejected with 409.
export const MAX_NAME_LENGTH = 30;
export const MAX_ANSWER_LENGTH = 200;

router.post('/games/:gameId/entries', async (req, res) => {
  const {gameId} = req.params;
  const {authorName: rawName, text: rawText} = req.body ?? {};

  if (typeof rawName !== 'string' || typeof rawText !== 'string') {
    return res.status(400).json({error: 'Name and answer must be text'});
  }
  const authorName = rawName.trim();
  const text = rawText.trim();
  if (!authorName) return res.status(400).json({error: 'Name is required'});
  if (!text) return res.status(400).json({error: 'Answer is required'});
  if (authorName.length > MAX_NAME_LENGTH) {
    return res.status(400).json({error: `Name must be ${MAX_NAME_LENGTH} characters or fewer`});
  }
  if (text.length > MAX_ANSWER_LENGTH) {
    return res.status(400).json({error: `Answer must be ${MAX_ANSWER_LENGTH} characters or fewer`});
  }

  try {
    const game = await getGame(gameId);
    if (!game) return res.status(404).json({error: 'Game not found'});
    if (game.started) return res.status(400).json({error: 'The game has already started'});

    const existing = await ddb.send(new QueryCommand({
      TableName: tables.entries,
      KeyConditionExpression: 'gameId = :g',
      ExpressionAttributeValues: {':g': gameId}
    }));
    const taken = (existing.Items || []).some(
        (e: any) => e.authorName.toLowerCase() === authorName.toLowerCase());
    if (taken) return res.status(409).json({error: 'That name is already taken in this game'});

    const entryId = uuidv4();
    const createdAt = new Date().toISOString();
    await ddb.send(new PutCommand({
      TableName: tables.entries,
      Item: {entryId, gameId, authorName, text, createdAt, revealed: false, expiresAt: expiresAt()}
    }));

    const io = (req as any).io;
    io.to(gameId).emit("entriesUpdated");

    res.json({entryId});
  } catch (error) {
    console.error('Add entry failed:', error);
    res.status(500).json({error: 'Failed to add entry'});
  }
});

// Start Game
router.post('/games/:gameId/start', async (req, res) => {
  const {gameId} = req.params;
  try {
    const game = await getGame(gameId);
    if (!game) return res.status(404).json({error: 'Game not found'});
    if (!isHost(game, req)) return res.status(403).json({error: 'Only the host can start the game'});
    if (game.started) return res.status(409).json({error: 'Game already started'});

    const entries = await ddb.send(new QueryCommand({
      TableName: tables.entries,
      KeyConditionExpression: 'gameId = :g',
      ExpressionAttributeValues: {':g': gameId}
    }));

    const entryItems = entries.Items || [];
    const players = entryItems.map((e: any) => e.authorName)
        .filter((v: any, i: number, a: any[]) => a.indexOf(v) === i);

    if (entryItems.length === 0) {
      return res.status(400).json({error: 'Add at least one entry before starting'});
    }
    if (players.length < 2) {
      return res.status(400).json({error: 'Need at least 2 players to start'});
    }

    const lastTurn: Record<string, number> = game.lastTurn || {};

    const shuffled = buildTurnOrder(players, lastTurn);

    // Conditional so two simultaneous starts can't both win and reshuffle the turn order.
    try {
      await ddb.send(new UpdateCommand({
        TableName: tables.games,
        Key: {gameId},
        UpdateExpression: 'SET turnOrder = :to, started = :s, lastTurn = if_not_exists(lastTurn, :empty), expiresAt = :e',
        ConditionExpression: 'attribute_not_exists(started) OR started = :notStarted',
        ExpressionAttributeValues: {
          ':to': shuffled, ':s': true, ':empty': {}, ':e': expiresAt(), ':notStarted': false
        }
      }));
    } catch (err: any) {
      if (err?.name === 'ConditionalCheckFailedException') {
        return res.status(409).json({error: 'Game already started'});
      }
      throw err;
    }

    // Reveal entries
    for (const entry of entryItems) {
      await ddb.send(new UpdateCommand({
        TableName: tables.entries,
        Key: {gameId: gameId, entryId: entry.entryId},
        UpdateExpression: 'set revealed = :r, expiresAt = :e',
        ExpressionAttributeValues: {':r': true, ':e': expiresAt()}
      }));
    }

    const io = (req as any).io;
    io.to(gameId).emit("gameStarted", {turnOrder: shuffled});
    res.json({success: true});
  } catch (err) {
    console.error(err);
    res.status(500).json({error: 'Start failed'});
  }
});

// Guess Logic
router.post('/games/:gameId/entries/:entryId/guess', async (req, res) => {
  const {gameId, entryId} = req.params;
  const {guesserName, guess} = req.body;
  const io = (req as any).io;

  try {
    const entryResult = await ddb.send(new GetCommand({
      TableName: tables.entries, Key: {gameId, entryId}
    }));
    const item = entryResult.Item;
    if (!item) return res.status(404).json({error: "Entry not found"});

    const isCorrect = item.authorName === guess;

    const game = await getGame(gameId);
    let turnOrder: string[] = game?.turnOrder || [];
    if (!turnOrder.includes(guesserName)) {
      return res.status(400).json({error: "Guesser is not in the turn order"});
    }
    if (turnOrder[0] !== guesserName) {
      return res.status(409).json({error: "It's not your turn"});
    }
    // The last player left may guess their own answer for a free point (ends the round).
    if (item.authorName === guesserName && turnOrder.length > 1) {
      return res.status(400).json({error: "You can't guess your own entry"});
    }
    if (item.guessed) {
      return res.status(409).json({error: 'That entry has already been guessed'});
    }

    if (isCorrect) {
      // Claim the entry first (conditional) so simultaneous guesses award only one point.
      try {
        await ddb.send(new UpdateCommand({
          TableName: tables.entries, Key: {gameId, entryId},
          UpdateExpression: 'SET guessed = :val, expiresAt = :e',
          ConditionExpression: 'attribute_not_exists(guessed) OR guessed = :no',
          ExpressionAttributeValues: {':val': true, ':no': false, ':e': expiresAt()}
        }));
      } catch (err: any) {
        if (err?.name === 'ConditionalCheckFailedException') {
          return res.status(409).json({error: 'That entry has already been guessed'});
        }
        throw err;
      }
    }

    // Record that the guesser just took a turn (drives next round's first player).
    // Single-key write so concurrent guesses can't overwrite each other's timestamps.
    await ddb.send(new UpdateCommand({
      TableName: tables.games, Key: {gameId},
      UpdateExpression: 'SET lastTurn.#p = :t, expiresAt = :e',
      ExpressionAttributeNames: {'#p': guesserName},
      ExpressionAttributeValues: {':t': Date.now(), ':e': expiresAt()}
    }));

    if (isCorrect) {
      // Update Score
      await ddb.send(new UpdateCommand({
        TableName: tables.scores, Key: {gameId, playerName: guesserName},
        UpdateExpression: 'ADD score :inc SET expiresAt = :e',
        ExpressionAttributeValues: {':inc': 1, ':e': expiresAt()}
      }));

      // Update Turn Order (Remove AUTHOR)
      turnOrder = turnOrder.filter((name: string) => name !== item.authorName);

      await ddb.send(new UpdateCommand({
        TableName: tables.games, Key: {gameId},
        UpdateExpression: 'SET turnOrder = :to', ExpressionAttributeValues: {':to': turnOrder}
      }));

      io.to(gameId).emit("scoreUpdated", {
        playerName: guesserName,
        authorName: item.authorName,
        guess: item.text
      });
      io.to(gameId).emit("nextTurn", {currentPlayer: turnOrder[0] || null, turnOrder});
      io.to(gameId).emit("entriesUpdated");

      return res.json({isCorrect: true});
    } else {
      // Wrong Guess - Rotate
      if (turnOrder.length > 1) {
        turnOrder.push(turnOrder.shift()!);
        await ddb.send(new UpdateCommand({
          TableName: tables.games, Key: {gameId},
          UpdateExpression: 'SET turnOrder = :to', ExpressionAttributeValues: {':to': turnOrder}
        }));
      }

      io.to(gameId).emit("wrongAnswer", {
        playerName: guesserName,
        authorName: item.authorName,
        guess: item.text
      });
      io.to(gameId).emit("nextTurn", {currentPlayer: turnOrder[0] || null, turnOrder});
      return res.json({isCorrect: false});
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({error: "Guess failed"});
  }
});

// ... Add the other GET routes (get game, get entries, get scores) here ...
// They follow the same pattern: fetch from DDB, return JSON.
router.get('/games/:gameId', async (req, res) => {
  const {gameId} = req.params;
  // Never expose the host token to players.
  const game = await getGame(gameId);
  if (!game) return res.status(404).json({error: 'Game not found'});
  const {hostToken: _hostToken, ...publicGame} = game;
  res.json(publicGame);
});

router.get('/games/:gameId/entries', async (req, res) => {
  const {gameId} = req.params;
  const result = await ddb.send(new QueryCommand({
    TableName: tables.entries,
    KeyConditionExpression: 'gameId = :g',
    ExpressionAttributeValues: {':g': gameId}
  }));
  res.json(result.Items || []);
});

router.get('/games/:gameId/scores', async (req, res) => {
  const {gameId} = req.params;
  const result = await ddb.send(new QueryCommand({
    TableName: tables.scores,
    KeyConditionExpression: 'gameId = :g',
    ExpressionAttributeValues: {':g': gameId}
  }));
  res.json(result.Items || []);
});

// Reset Game
router.post('/games/:gameId/reset', async (req, res) => {
  const {gameId} = req.params;
  const {question} = req.body;

  try {
    const game = await getGame(gameId);
    if (!game) return res.status(404).json({error: 'Game not found'});
    if (!isHost(game, req)) return res.status(403).json({error: 'Only the host can reset the game'});

    // 1. DELETE ALL existing entries for this game
    const entriesData = await ddb.send(new QueryCommand({
      TableName: tables.entries,
      KeyConditionExpression: 'gameId = :g',
      ExpressionAttributeValues: {':g': gameId}
    }));

    const deletePromises = (entriesData.Items || []).map(entry =>
        ddb.send(new DeleteCommand({
          TableName: tables.entries,
          Key: {gameId: entry.gameId, entryId: entry.entryId}
        }))
    );
    await Promise.all(deletePromises);

    // 2. Reset Game state
    await ddb.send(new UpdateCommand({
      TableName: tables.games,
      Key: {gameId},
      UpdateExpression: 'SET question = :q, createdAt = :c, started = :started, expiresAt = :e',
      ExpressionAttributeValues: {
        ':q': question?.trim() || 'What is your favorite thing?',
        ':c': new Date().toISOString(),
        ':started': false,
        ':e': expiresAt()
      },
      ReturnValues: 'ALL_NEW'
    }));

    // 3. Emit Reset Event
    const io = (req as any).io;
    io.to(gameId).emit("gameReset");

    res.json({success: true, message: 'Game reset with fresh slate'});
  } catch (error) {
    console.error('Reset error:', error);
    res.status(500).json({error: 'Failed to reset game'});
  }
});


export default router;
