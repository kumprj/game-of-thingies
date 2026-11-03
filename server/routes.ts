import {timingSafeEqual} from 'crypto';
import express from 'express';
import {v4 as uuidv4} from 'uuid';
import type {Server} from 'socket.io';
import {asyncHandler, getIo} from './http';
import type {EntryItem, GameItem} from './models';
import {ddb, expiresAt, tables} from './db';
import {buildTurnOrder, rotate} from './turnOrder';
import {validateGameSetup} from './gameSetup';
import {answeredNames} from './lobby';
import {
  checkNameLength,
  validateEntryInput,
  validateEntryText,
  validateGuess,
  validateParam,
  validateReset,
  validateTokenHeaders
} from './validation';
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  BatchWriteCommand,
  TransactWriteCommand
} from "@aws-sdk/lib-dynamodb";

const router = express.Router();
router.use(validateTokenHeaders);
router.param('gameId', validateParam);
router.param('entryId', validateParam);
router.param('playerName', validateParam);
const MAX_CODE_ATTEMPTS = 10;

async function getGame(gameId: string): Promise<GameItem | undefined> {
  const result = await ddb.send(new GetCommand({TableName: tables.games, Key: {gameId}}));
  return result.Item as GameItem | undefined;
}

async function getEntry(gameId: string, entryId: string): Promise<EntryItem | undefined> {
  const result = await ddb.send(new GetCommand({TableName: tables.entries, Key: {gameId, entryId}}));
  return result.Item as EntryItem | undefined;
}

/** True when two strings are equal, compared in constant time. */
function tokensMatch(stored: unknown, given: unknown) {
  if (typeof stored !== 'string' || typeof given !== 'string') return false;
  const a = Buffer.from(stored);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** True when the request's x-host-token header matches the game's stored host token. */
function isHost(game: GameItem | undefined, req: express.Request) {
  return tokensMatch(game?.hostToken, req.header('x-host-token'));
}

/** True when a DynamoDB error is a failed ConditionExpression. */
function isConditionalCheckFailure(err: unknown) {
  return (err as {name?: string})?.name === 'ConditionalCheckFailedException';
}

/** Every entry of a game, straight from the table (includes tokens; never send it to clients as is). */
async function queryEntries(gameId: string): Promise<EntryItem[]> {
  const result = await ddb.send(new QueryCommand({
    TableName: tables.entries,
    KeyConditionExpression: 'gameId = :g',
    ExpressionAttributeValues: {':g': gameId}
  }));
  return (result.Items || []) as EntryItem[];
}

/**
 * True when the entry is bound to a different device than the requester: either the entry's own
 * author token or the token its author's name was claimed with. Unbound entries match anyone.
 */
function authorTokenMismatch(item: EntryItem, game: GameItem, req: express.Request) {
  const playerToken = req.header('x-player-token');
  const boundToken = item.authorToken || game.playerTokens?.[item.authorName.toLowerCase()];
  return Boolean(boundToken && (!playerToken || boundToken !== playerToken));
}

function emitNextTurn(io: Server, gameId: string, turnOrder: string[]) {
  io.to(gameId).emit('nextTurn', {currentPlayer: turnOrder[0] || null, turnOrder});
}

/**
 * Saves a new turn order only if it still equals `previous` (what the caller read), so two
 * simultaneous changes can't overwrite each other. Returns false when someone else changed it first.
 */
async function writeTurnOrder(gameId: string, previous: string[], next: string[]) {
  try {
    await ddb.send(new UpdateCommand({
      TableName: tables.games,
      Key: {gameId},
      UpdateExpression: 'SET turnOrder = :to, expiresAt = :e',
      ConditionExpression: 'turnOrder = :prev',
      ExpressionAttributeValues: {':to': next, ':e': expiresAt(), ':prev': previous}
    }));
    return true;
  } catch (err) {
    if (isConditionalCheckFailure(err)) return false;
    throw err;
  }
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
            title: name,
            hostName: name,
            hostToken,
            playerTokens: {},
            expiresAt: expiresAt()
          },
          ConditionExpression: 'attribute_not_exists(gameId)'
        }));
        return res.json({gameId, hostToken});
      } catch (error) {
        if (!isConditionalCheckFailure(error)) throw error;
      }
    }
    throw new Error(`No free game code after ${MAX_CODE_ATTEMPTS} attempts`);
  } catch (error) {
    console.error('Create game failed:', error);
    res.status(500).json({error: 'Failed to create game'});
  }
});

// Add Entry. Names are unique within a game (case-insensitive); a duplicate is rejected with 409.
router.post('/games/:gameId/entries', async (req, res) => {
  const {gameId} = req.params;
  const valid = validateEntryInput(req.body);
  if (!valid.ok) return res.status(400).json({error: valid.error});
  const {authorName, text} = valid;

  try {
    const game = await getGame(gameId);
    if (!game) return res.status(404).json({error: 'Game not found'});
    if (game.started) return res.status(400).json({error: 'The game has already started'});

    const playerToken = req.header('x-player-token');
    const existingTokens = game.playerTokens || {};
    const normName = authorName.toLowerCase();
    if (existingTokens[normName] && (!playerToken || existingTokens[normName] !== playerToken)) {
      return res.status(403).json({error: 'A player with this name already exists in this game'});
    }

    const existing = await queryEntries(gameId);
    const taken = existing.some(
        e => e.authorName.toLowerCase() === authorName.toLowerCase());
    if (taken) return res.status(409).json({error: 'That name is already taken in this game'});

    const entryId = uuidv4();
    const createdAt = new Date().toISOString();
    await ddb.send(new PutCommand({
      TableName: tables.entries,
      Item: {
        entryId,
        gameId,
        authorName,
        authorToken: playerToken || undefined,
        text,
        createdAt,
        revealed: false,
        expiresAt: expiresAt()
      }
    }));

    if (playerToken) {
      try {
        const bindToken = () => ddb.send(new UpdateCommand({
          TableName: tables.games,
          Key: {gameId},
          UpdateExpression: 'SET playerTokens.#p = :token, expiresAt = :e',
          ExpressionAttributeNames: {'#p': normName},
          ExpressionAttributeValues: {':token': playerToken, ':e': expiresAt()}
        }));
        try {
          await bindToken();
        } catch (err) {
          if ((err as {name?: string})?.name !== 'ValidationException') throw err;
          // Game created before playerTokens existed on new games: create the map, then bind.
          await ddb.send(new UpdateCommand({
            TableName: tables.games,
            Key: {gameId},
            UpdateExpression: 'SET playerTokens = if_not_exists(playerTokens, :empty), expiresAt = :e',
            ExpressionAttributeValues: {':empty': {}, ':e': expiresAt()}
          }));
          await bindToken();
        }
      } catch (err) {
        console.error('Failed to save playerToken:', err);
      }
    }

    const io = getIo(req);
    io.to(gameId).emit("entriesUpdated");

    res.json({entryId});
  } catch (error) {
    console.error('Add entry failed:', error);
    res.status(500).json({error: 'Failed to add entry'});
  }
});

// Edit Entry (Pre-Game only, Author only)
router.patch('/games/:gameId/entries/:entryId', async (req, res) => {
  const {gameId, entryId} = req.params;
  const valid = validateEntryText(req.body);
  if (!valid.ok) return res.status(400).json({error: valid.error});
  const {text} = valid;

  try {
    const game = await getGame(gameId);
    if (!game) return res.status(404).json({error: 'Game not found'});
    if (game.started) return res.status(400).json({error: 'The game has already started'});

    const item = await getEntry(gameId, entryId);
    if (!item) return res.status(404).json({error: 'Entry not found'});

    if (authorTokenMismatch(item, game, req)) {
      return res.status(403).json({error: 'Only the author can edit this entry'});
    }

    await ddb.send(new UpdateCommand({
      TableName: tables.entries,
      Key: {gameId, entryId},
      UpdateExpression: 'SET #t = :txt, expiresAt = :e',
      ExpressionAttributeNames: {'#t': 'text'},
      ExpressionAttributeValues: {':txt': text, ':e': expiresAt()}
    }));

    const io = getIo(req);
    io.to(gameId).emit('entriesUpdated');

    res.json({success: true});
  } catch (err) {
    console.error('Edit entry failed:', err);
    res.status(500).json({error: 'Failed to edit entry'});
  }
});

// Delete Entry (Pre-Game only, Author only)
router.delete('/games/:gameId/entries/:entryId', async (req, res) => {
  const {gameId, entryId} = req.params;
  try {
    const game = await getGame(gameId);
    if (!game) return res.status(404).json({error: 'Game not found'});
    if (game.started) return res.status(400).json({error: 'The game has already started'});

    const item = await getEntry(gameId, entryId);
    if (!item) return res.status(404).json({error: 'Entry not found'});

    if (authorTokenMismatch(item, game, req)) {
      return res.status(403).json({error: 'Only the author can delete this entry'});
    }
    const authorLower = item.authorName.toLowerCase();

    await ddb.send(new DeleteCommand({
      TableName: tables.entries,
      Key: {gameId, entryId}
    }));

    if (game.playerTokens?.[authorLower]) {
      try {
        await ddb.send(new UpdateCommand({
          TableName: tables.games,
          Key: {gameId},
          UpdateExpression: 'REMOVE playerTokens.#p',
          ExpressionAttributeNames: {'#p': authorLower}
        }));
      } catch (e) {
        console.error('Failed to remove player token:', e);
      }
    }

    const io = getIo(req);
    io.to(gameId).emit('entriesUpdated');

    res.json({success: true});
  } catch (err) {
    console.error('Delete entry failed:', err);
    res.status(500).json({error: 'Failed to delete entry'});
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

    const entryItems = await queryEntries(gameId);
    const players: string[] = [...new Set(entryItems.map(e => e.authorName))];

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
        UpdateExpression: 'SET turnOrder = :to, players = :pl, started = :s, lastTurn = if_not_exists(lastTurn, :empty), expiresAt = :e',
        ConditionExpression: 'attribute_not_exists(started) OR started = :notStarted',
        ExpressionAttributeValues: {
          ':to': shuffled, ':pl': players, ':s': true, ':empty': {}, ':e': expiresAt(), ':notStarted': false
        }
      }));
    } catch (err) {
      if (isConditionalCheckFailure(err)) {
        return res.status(409).json({error: 'Game already started'});
      }
      throw err;
    }

    // Reveal entries
    await Promise.all(entryItems.map(entry => ddb.send(new UpdateCommand({
      TableName: tables.entries,
      Key: {gameId: gameId, entryId: entry.entryId},
      UpdateExpression: 'set revealed = :r, expiresAt = :e',
      ExpressionAttributeValues: {':r': true, ':e': expiresAt()}
    }))));

    const io = getIo(req);
    io.to(gameId).emit("gameStarted", {turnOrder: shuffled});
    // Returned too so the host doesn't depend on its own socket event to see whose turn it is.
    res.json({success: true, turnOrder: shuffled});
  } catch (err) {
    console.error(err);
    res.status(500).json({error: 'Start failed'});
  }
});

// Guess Logic
router.post('/games/:gameId/entries/:entryId/guess', async (req, res) => {
  const {gameId, entryId} = req.params;
  const parsed = validateGuess(req.body);
  if (!parsed.ok) return res.status(400).json({error: parsed.error});
  const {guesserName, guess} = parsed;
  const io = getIo(req);

  try {
    const [item, game] = await Promise.all([getEntry(gameId, entryId), getGame(gameId)]);
    if (!game) return res.status(404).json({error: "Game not found"});

    // Turn state is checked before the entry lookup, so a request that is not allowed to guess
    // gets the turn error whatever entry id it sends.
    let turnOrder: string[] = game.turnOrder || [];
    if (!turnOrder.includes(guesserName)) {
      return res.status(400).json({error: "Guesser is not in the turn order"});
    }
    if (turnOrder[0] !== guesserName) {
      return res.status(409).json({error: "It's not your turn"});
    }

    const playerToken = req.header('x-player-token');
    const existingTokens = game.playerTokens || {};
    const normName = guesserName.toLowerCase();
    if (existingTokens[normName] && (!playerToken || existingTokens[normName] !== playerToken)) {
      return res.status(403).json({error: 'Player token mismatch'});
    }

    if (!item) return res.status(404).json({error: "Entry not found"});
    const isCorrect = item.authorName === guess;

    // The last player left may guess their own answer for a free point (ends the round).
    if (item.authorName === guesserName && turnOrder.length > 1) {
      return res.status(400).json({error: "You can't guess your own entry"});
    }
    // Naming yourself as the author is only allowed once you're the last player left.
    if (guess === guesserName && turnOrder.length > 1) {
      return res.status(400).json({error: "You can't guess yourself until you're the last player left"});
    }
    if (item.guessed) {
      return res.status(409).json({error: 'That entry has already been guessed'});
    }

    // Rotate on a wrong guess; drop the author on a correct one.
    const nextOrder = isCorrect
        ? turnOrder.filter((name: string) => name !== item.authorName)
        : rotate(turnOrder);

    // The turn order is only written if it still equals what was read, so a simultaneous skip,
    // removal or guess can't be overwritten with a stale copy. lastTurn is a single-key write
    // (drives next round's first player).
    const gameUpdate = {
      TableName: tables.games, Key: {gameId},
      UpdateExpression: 'SET lastTurn.#p = :t, turnOrder = :to, expiresAt = :e',
      ConditionExpression: 'turnOrder = :prev',
      ExpressionAttributeNames: {'#p': guesserName},
      ExpressionAttributeValues: {':t': Date.now(), ':to': nextOrder, ':e': expiresAt(), ':prev': turnOrder}
    };

    try {
      if (isCorrect) {
        // One transaction: claim the entry (so simultaneous guesses award one point), update the
        // turn order and award the point together or not at all.
        await ddb.send(new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: tables.entries, Key: {gameId, entryId},
                UpdateExpression: 'SET guessed = :val, expiresAt = :e',
                ConditionExpression: 'attribute_not_exists(guessed) OR guessed = :no',
                ExpressionAttributeValues: {':val': true, ':no': false, ':e': expiresAt()}
              }
            },
            {Update: gameUpdate},
            {
              Update: {
                TableName: tables.scores, Key: {gameId, playerName: guesserName},
                UpdateExpression: 'ADD score :inc SET expiresAt = :e',
                ExpressionAttributeValues: {':inc': 1, ':e': expiresAt()}
              }
            }
          ]
        }));
      } else {
        await ddb.send(new UpdateCommand(gameUpdate));
      }
    } catch (err) {
      if (isConditionalCheckFailure(err)) {
        return res.status(409).json({error: 'The game changed while you were guessing. Try again.'});
      }
      const cancel = err as {name?: string; CancellationReasons?: {Code?: string}[]};
      if (cancel?.name === 'TransactionCanceledException') {
        const alreadyGuessed = cancel.CancellationReasons?.[0]?.Code === 'ConditionalCheckFailed';
        return res.status(409).json({
          error: alreadyGuessed ? 'That entry has already been guessed'
              : 'The game changed while you were guessing. Try again.'
        });
      }
      throw err;
    }
    turnOrder = nextOrder;

    if (isCorrect) {
      io.to(gameId).emit("scoreUpdated", {
        playerName: guesserName,
        authorName: item.authorName,
        guess: item.text
      });
      emitNextTurn(io, gameId, turnOrder);
      io.to(gameId).emit("entriesUpdated");
      return res.json({isCorrect: true});
    }

    // No authorName here: a wrong guess must not reveal who really wrote the answer.
    io.to(gameId).emit("wrongAnswer", {
      playerName: guesserName,
      guess: item.text
    });
    emitNextTurn(io, gameId, turnOrder);
    return res.json({isCorrect: false});
  } catch (err) {
    console.error(err);
    res.status(500).json({error: "Guess failed"});
  }
});

// Skip Turn (Host only, Game started)
router.post('/games/:gameId/skip-turn', async (req, res) => {
  const {gameId} = req.params;
  try {
    const game = await getGame(gameId);
    if (!game) return res.status(404).json({error: 'Game not found'});
    if (!isHost(game, req)) return res.status(403).json({error: 'Only the host can skip turns'});
    if (!game.started) return res.status(400).json({error: 'The game has not started yet'});

    const current: string[] = game.turnOrder || [];
    if (current.length === 0) return res.status(400).json({error: 'No turns to skip'});

    const turnOrder = rotate(current);

    if (!await writeTurnOrder(gameId, current, turnOrder)) {
      return res.status(409).json({error: 'The game changed. Try again.'});
    }

    const io = getIo(req);
    emitNextTurn(io, gameId, turnOrder);

    res.json({success: true, turnOrder});
  } catch (err) {
    console.error('Skip turn failed:', err);
    res.status(500).json({error: 'Failed to skip turn'});
  }
});

// Remove Player (Host only, Game started)
router.delete('/games/:gameId/players/:playerName', async (req, res) => {
  const {gameId, playerName} = req.params;
  try {
    const game = await getGame(gameId);
    if (!game) return res.status(404).json({error: 'Game not found'});
    if (!isHost(game, req)) return res.status(403).json({error: 'Only the host can remove players'});
    if (!game.started) return res.status(400).json({error: 'The game has not started yet'});

    const current: string[] = game.turnOrder || [];
    if (!current.includes(playerName)) return res.status(404).json({error: 'Player not found'});
    const turnOrder = current.filter((name: string) => name !== playerName);

    if (!await writeTurnOrder(gameId, current, turnOrder)) {
      return res.status(409).json({error: 'The game changed. Try again.'});
    }

    const io = getIo(req);
    io.to(gameId).emit('playerRemoved', {playerName, turnOrder});
    emitNextTurn(io, gameId, turnOrder);

    res.json({success: true, turnOrder});
  } catch (err) {
    console.error('Remove player failed:', err);
    res.status(500).json({error: 'Failed to remove player'});
  }
});

// Transfer Host (Host only)
router.post('/games/:gameId/transfer-host', async (req, res) => {
  const {gameId} = req.params;
  const {targetPlayerName: rawTarget} = req.body ?? {};

  if (typeof rawTarget !== 'string' || !rawTarget.trim()) {
    return res.status(400).json({error: 'Target player name is required'});
  }
  const targetPlayerName = rawTarget.trim();
  const nameError = checkNameLength(targetPlayerName);
  if (nameError) return res.status(400).json({error: nameError});

  try {
    const game = await getGame(gameId);
    if (!game) return res.status(404).json({error: 'Game not found'});
    if (!isHost(game, req)) return res.status(403).json({error: 'Only the host can transfer host privileges'});

    const newHostToken = uuidv4();
    await ddb.send(new UpdateCommand({
      TableName: tables.games,
      Key: {gameId},
      UpdateExpression: 'SET hostToken = :token, hostName = :name, expiresAt = :e',
      ExpressionAttributeValues: {
        ':token': newHostToken,
        ':name': targetPlayerName,
        ':e': expiresAt()
      }
    }));

    const io = getIo(req);
    io.to(gameId).emit('hostTransferred', {
      newHostName: targetPlayerName,
      hostToken: newHostToken
    });

    res.json({success: true, newHostName: targetPlayerName});
  } catch (err) {
    console.error('Transfer host failed:', err);
    res.status(500).json({error: 'Failed to transfer host'});
  }
});

router.get('/games/:gameId', asyncHandler(async (req, res) => {
  const {gameId} = req.params;
  // Never expose the host token or player tokens to players.
  const game = await getGame(gameId);
  if (!game) return res.status(404).json({error: 'Game not found'});
  // Games created before the rename stored the title as `gameOwner`; they expire within a day.
  const {hostToken: _hostToken, playerTokens: _playerTokens, gameOwner, ...publicGame} = game;
  const body: Record<string, unknown> = {...publicGame, title: publicGame.title || gameOwner};
  // Lobby (#42): names only, sorted so neither order nor entry ids link a name to an answer.
  if (!game.started) body.answeredNames = answeredNames(await queryEntries(gameId));
  res.json(body);
}));

router.get('/games/:gameId/entries', asyncHandler(async (req, res) => {
  const {gameId} = req.params;
  const [items, game] = await Promise.all([queryEntries(gameId), getGame(gameId)]);
  const started = Boolean(game?.started);
  const requester = req.header('x-player-token');
  // What the requester may see (#29): never authorToken; text and author only once they can't spoil the game.
  res.json(items.map(e => {
    const mine = tokensMatch(e.authorToken, requester);
    const guessed = Boolean(e.guessed);
    const entry: Record<string, unknown> = {
      entryId: e.entryId,
      gameId: e.gameId,
      createdAt: e.createdAt,
      revealed: Boolean(e.revealed),
      guessed,
      mine
    };
    if (started || mine) entry.text = e.text;
    if (mine || (started && guessed)) entry.authorName = e.authorName;
    return entry;
  }));
}));

router.get('/games/:gameId/scores', asyncHandler(async (req, res) => {
  const {gameId} = req.params;
  const result = await ddb.send(new QueryCommand({
    TableName: tables.scores,
    KeyConditionExpression: 'gameId = :g',
    ExpressionAttributeValues: {':g': gameId}
  }));
  res.json(result.Items || []);
}));

// Reset Game
router.post('/games/:gameId/reset', async (req, res) => {
  const {gameId} = req.params;
  const parsed = validateReset(req.body);
  if (!parsed.ok) return res.status(400).json({error: parsed.error});

  try {
    const game = await getGame(gameId);
    if (!game) return res.status(404).json({error: 'Game not found'});
    if (!isHost(game, req)) return res.status(403).json({error: 'Only the host can reset the game'});

    // 1. DELETE ALL existing entries for this game
    const entriesData = await queryEntries(gameId);

    for (let i = 0; i < entriesData.length; i += 25) {
      const chunk = entriesData.slice(i, i + 25);
      await ddb.send(new BatchWriteCommand({
        RequestItems: {
          [tables.entries]: chunk.map(entry => ({
            DeleteRequest: {
              Key: {gameId: entry.gameId, entryId: entry.entryId}
            }
          }))
        }
      }));
    }

    // 2. Reset Game state
    await ddb.send(new UpdateCommand({
      TableName: tables.games,
      Key: {gameId},
      UpdateExpression: 'SET question = :q, createdAt = :c, started = :started, expiresAt = :e REMOVE turnOrder, players',
      ExpressionAttributeValues: {
        ':q': parsed.question,
        ':c': new Date().toISOString(),
        ':started': false,
        ':e': expiresAt()
      },
      ReturnValues: 'ALL_NEW'
    }));

    // 3. Emit Reset Event
    const io = getIo(req);
    io.to(gameId).emit("gameReset");

    res.json({success: true, message: 'Game reset with fresh slate'});
  } catch (error) {
    console.error('Reset error:', error);
    res.status(500).json({error: 'Failed to reset game'});
  }
});


export default router;
