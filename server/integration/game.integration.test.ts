import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import type {AddressInfo} from 'net';
import {CreateTableCommand, DeleteTableCommand, DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient, QueryCommand} from '@aws-sdk/lib-dynamodb';
import {io as connect, type Socket} from 'socket.io-client';

// Plays real games through the HTTP API and Socket.IO against DynamoDB Local, so every route,
// event and table write is exercised without touching AWS. Needs DynamoDB Local running:
//   docker run --rm -p 8000:8000 amazon/dynamodb-local
// then `npm run test:integration`. CI runs it as a service container (.github/workflows/ci.yml).

const endpoint = process.env.DYNAMODB_ENDPOINT ?? 'http://localhost:8000';
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const tableNames = {games: `Games-${suffix}`, entries: `Entries-${suffix}`, scores: `Scores-${suffix}`};

// Same keys as sst.config.ts and cfn_tables.yml
const schemas = [
  {TableName: tableNames.games, keys: [['gameId', 'HASH']]},
  {TableName: tableNames.entries, keys: [['gameId', 'HASH'], ['entryId', 'RANGE']]},
  {TableName: tableNames.scores, keys: [['gameId', 'HASH'], ['playerName', 'RANGE']]},
] as const;

const dynamo = new DynamoDBClient({
  region: 'us-east-1',
  endpoint,
  credentials: {accessKeyId: 'local', secretAccessKey: 'local'},
});

let baseUrl = '';
let close: () => Promise<void>;
const sockets: Socket[] = [];

// Host tokens by game id, so tests call start/reset as the host without passing the token around
const hostTokens = new Map<string, string>();

async function api<T = any>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: object, headers: Record<string, string> = {}): Promise<{status: number; data: T}> {
  const gameId = path.match(/^\/api\/games\/([^/]+)\/(start|reset|skip-turn|players|transfer-host)/)?.[1];
  const token = gameId && hostTokens.get(gameId);
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {...(body ? {'Content-Type': 'application/json'} : {}), ...(token ? {'x-host-token': token} : {}), ...headers},
    body: body ? JSON.stringify(body) : undefined,
  });
  return {status: response.status, data: await response.json().catch(() => undefined) as T};
}

/** A player's socket, joined to the game's room, recording every event it receives. */
async function joinRoom(gameId: string) {
  const socket = connect(baseUrl, {transports: ['websocket'], forceNew: true});
  sockets.push(socket);
  const events: {name: string; payload: any}[] = [];
  socket.onAny((name, payload) => events.push({name, payload}));
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  socket.emit('joinGame', gameId);
  // joinGame has no acknowledgement, so give the server a moment to add the socket to the room
  await new Promise(r => setTimeout(r, 100));

  return {
    socket,
    events,
    /** Resolves with the payload of the next `name` event received after `since`. */
    async next(name: string, since: number, timeoutMs = 3000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const event = events.slice(since).find(e => e.name === name);
        if (event) return event.payload;
        await new Promise(r => setTimeout(r, 20));
      }
      throw new Error(`No "${name}" event within ${timeoutMs}ms (got ${events.map(e => e.name).join(', ') || 'none'})`);
    },
  };
}

async function createGame(name = 'Host', question = 'What is your favorite thing?') {
  const {status, data} = await api<{gameId: string; hostToken: string}>('POST', '/api/createGame', {name, question});
  expect(status).toBe(200);
  expect(data.gameId).toMatch(/^[A-Z]{4}$/);
  hostTokens.set(data.gameId, data.hostToken);
  return data.gameId;
}

async function addEntry(gameId: string, authorName: string, text: string) {
  const {status, data} = await api<{entryId: string}>('POST', `/api/games/${gameId}/entries`, {authorName, text});
  expect(status).toBe(200);
  return data.entryId;
}

/** Entries as stored (answers, authors and tokens included), read straight from DynamoDB for assertions. */
const entries = async (gameId: string) => (await DynamoDBDocumentClient.from(dynamo).send(new QueryCommand({
  TableName: tableNames.entries,
  KeyConditionExpression: 'gameId = :g',
  ExpressionAttributeValues: {':g': gameId},
}))).Items as any[];
/** Entries as the API shows them to a requester, who may identify as a player with a token (#29). */
const entriesAs = async (gameId: string, token?: string) =>
  (await api<any[]>('GET', `/api/games/${gameId}/entries`, undefined, token ? {'x-player-token': token} : {})).data;
const game = async (gameId: string) => (await api<any>('GET', `/api/games/${gameId}`)).data;
const scores = async (gameId: string) => (await api<any[]>('GET', `/api/games/${gameId}/scores`)).data;

beforeAll(async () => {
  for (const {TableName, keys} of schemas) {
    await dynamo.send(new CreateTableCommand({
      TableName,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: keys.map(([AttributeName]) => ({AttributeName, AttributeType: 'S'})),
      KeySchema: keys.map(([AttributeName, KeyType]) => ({AttributeName, KeyType})),
    }));
  }

  // db.ts reads these when it's first imported, so set them before loading the app
  Object.assign(process.env, {
    DYNAMODB_ENDPOINT: endpoint,
    AWS_ACCESS_KEY_ID: 'local',
    AWS_SECRET_ACCESS_KEY: 'local',
    GAMES_TABLE: tableNames.games,
    ENTRIES_TABLE: tableNames.entries,
    SCORES_TABLE: tableNames.scores,
  });
  const {createServer} = await import('../app.js');
  const {httpServer, io} = createServer();
  await new Promise<void>(resolve => httpServer.listen(0, resolve));
  baseUrl = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
  close = () => new Promise(resolve => io.close(() => resolve()));
});

afterAll(async () => {
  sockets.forEach(socket => socket.disconnect());
  await close?.();
  await Promise.all(Object.values(tableNames).map(TableName =>
    dynamo.send(new DeleteTableCommand({TableName})).catch(() => undefined)));
});

describe('health', () => {
  it('answers the load balancer health check', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('OK');
  });
});

describe('creating and loading games', () => {
  it('stores the owner and question', async () => {
    const gameId = await createGame('Ann', 'Things you find in a fridge');
    expect(await game(gameId)).toMatchObject({gameId, title: 'Ann', question: 'Things you find in a fridge'});
  });

  it('exposes the title but no gameOwner', async () => {
    const gameId = await createGame('Ann');
    const data = await game(gameId);
    expect(data.title).toBe('Ann');
    expect(data).not.toHaveProperty('gameOwner');
  });

  it('stores the trimmed title and question', async () => {
    const {status, data} = await api('POST', '/api/createGame', {name: '  Ann ', question: ' Worst power? '});
    expect(status).toBe(200);
    expect(await game(data.gameId)).toMatchObject({title: 'Ann', question: 'Worst power?'});
  });

  it.each([
    ['a missing title', {question: 'Q'}, 'Title and question must be text'],
    ['a missing question', {name: 'Ann'}, 'Title and question must be text'],
    ['a non-text title', {name: 7, question: 'Q'}, 'Title and question must be text'],
    ['a blank title', {name: '  ', question: 'Q'}, 'Title is required'],
    ['a blank question', {name: 'Ann', question: ' '}, 'Question is required'],
    ['an oversized title', {name: 'a'.repeat(51), question: 'Q'}, 'Title must be 50 characters or fewer'],
    ['an oversized question', {name: 'Ann', question: 'q'.repeat(201)}, 'Question must be 200 characters or fewer'],
  ])('rejects %s with a 400', async (_label, body, error) => {
    expect(await api('POST', '/api/createGame', body)).toEqual({status: 400, data: {error}});
  });

  it('accepts a title and question at the limits', async () => {
    const {status} = await api('POST', '/api/createGame', {name: 'a'.repeat(50), question: 'q'.repeat(200)});
    expect(status).toBe(200);
  });

  it('picks a new code instead of overwriting a live game on collision', async () => {
    // Math.random() === 0 yields "AAAA"; the second game's first attempt collides, then it gets "BBBB"
    const codes = [0, 0, 0, 0, 0, 0, 0, 0, 0.04, 0.04, 0.04, 0.04];
    let call = 0;
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => codes[Math.min(call++, codes.length - 1)]);
    try {
      const first = await createGame('Ann', 'First question');
      const second = await createGame('Bob', 'Second question');
      expect(first).toBe('AAAA');
      expect(second).toBe('BBBB');
      expect(await game(first)).toMatchObject({title: 'Ann', question: 'First question'});
      expect(await game(second)).toMatchObject({title: 'Bob', question: 'Second question'});
    } finally {
      spy.mockRestore();
    }
  });

  it('404s an unknown game but lists no entries or scores for it', async () => {
    expect(await api('GET', '/api/games/ZZZZ-unknown')).toEqual({status: 404, data: {error: 'Game not found'}});
    expect(await entriesAs('ZZZZ-unknown')).toEqual([]);
    expect(await scores('ZZZZ-unknown')).toEqual([]);
  });
});

describe('a full round', () => {
  it('collects answers, starts, takes guesses, scores and resets', async () => {
    const gameId = await createGame('Ann', 'Things you shout at a referee');
    const room = await joinRoom(gameId);

    // Answers
    let mark = room.events.length;
    await addEntry(gameId, 'Ann', 'Are you blind?');
    await room.next('entriesUpdated', mark);
    const benEntry = await addEntry(gameId, 'Ben', 'Offside!');
    await addEntry(gameId, 'Cy', 'Check the replay');

    const before = await entries(gameId);
    expect(before).toHaveLength(3);
    expect(before.every(e => e.revealed === false)).toBe(true);
    expect(before.find(e => e.entryId === benEntry)).toMatchObject({gameId, authorName: 'Ben', text: 'Offside!'});

    // Start: everyone is in the turn order, and every answer is revealed
    mark = room.events.length;
    const started = (await api('POST', `/api/games/${gameId}/start`)).data;
    const {turnOrder} = await room.next('gameStarted', mark);
    expect(started).toEqual({success: true, turnOrder});
    expect([...turnOrder].sort()).toEqual(['Ann', 'Ben', 'Cy']);
    expect(await game(gameId)).toMatchObject({started: true, turnOrder});
    expect((await entries(gameId)).every(e => e.revealed === true)).toBe(true);

    // A wrong guess rotates the turn to the next player
    const [first, second] = turnOrder as string[];
    const someoneElses = before.find(e => e.authorName !== first)!;
    mark = room.events.length;
    const wrong = await api('POST', `/api/games/${gameId}/entries/${someoneElses.entryId}/guess`,
      {guesserName: first, guess: 'Nobody'});
    expect(wrong).toEqual({status: 200, data: {isCorrect: false}});
    expect(await room.next('wrongAnswer', mark)).toEqual({
      playerName: first, guess: someoneElses.text,
    });
    const afterWrong = await room.next('nextTurn', mark);
    expect(afterWrong.currentPlayer).toBe(second);
    expect(afterWrong.turnOrder).toEqual([...(turnOrder as string[]).slice(1), first]);
    expect((await game(gameId)).turnOrder).toEqual(afterWrong.turnOrder);
    expect((await game(gameId)).lastTurn[first]).toEqual(expect.any(Number));

    // A right guess scores, marks the answer guessed and takes its author out of the turn order
    const target = before.find(e => e.authorName !== second)!;
    mark = room.events.length;
    const right = await api('POST', `/api/games/${gameId}/entries/${target.entryId}/guess`,
      {guesserName: second, guess: target.authorName});
    expect(right).toEqual({status: 200, data: {isCorrect: true}});
    expect(await room.next('scoreUpdated', mark)).toEqual({
      playerName: second, authorName: target.authorName, guess: target.text,
    });
    const afterRight = await room.next('nextTurn', mark);
    expect(afterRight.turnOrder).not.toContain(target.authorName);
    expect(afterRight.currentPlayer).toBe(afterRight.turnOrder[0]);
    await room.next('entriesUpdated', mark);
    expect((await entries(gameId)).find(e => e.entryId === target.entryId).guessed).toBe(true);
    expect(await scores(gameId)).toEqual([{gameId, playerName: second, score: 1, expiresAt: expect.any(Number)}]);

    // A new round clears the answers and keeps the scores
    mark = room.events.length;
    expect((await api('POST', `/api/games/${gameId}/reset`, {question: '  Best pizza toppings  '})).status).toBe(200);
    await room.next('gameReset', mark);
    expect(await entriesAs(gameId)).toEqual([]);
    expect(await game(gameId)).toMatchObject({question: 'Best pizza toppings', started: false});
    expect(await scores(gameId)).toHaveLength(1);
  });

  it('starts the next round with whoever went longest ago', async () => {
    const gameId = await createGame('Ann');
    for (const name of ['Ann', 'Ben', 'Cy']) await addEntry(gameId, name, `${name}'s answer`);
    await api('POST', `/api/games/${gameId}/start`);
    const {turnOrder} = await game(gameId);

    // Only the first player guesses, so the other two are "never went" and must lead next round
    const list = await entries(gameId);
    const other = list.find(e => e.authorName !== turnOrder[0]);
    await api('POST', `/api/games/${gameId}/entries/${other.entryId}/guess`,
      {guesserName: turnOrder[0], guess: 'Nobody'});

    await api('POST', `/api/games/${gameId}/reset`, {question: 'Round two'});
    for (const name of ['Ann', 'Ben', 'Cy']) await addEntry(gameId, name, `${name} again`);
    await api('POST', `/api/games/${gameId}/start`);
    expect((await game(gameId)).turnOrder[0]).not.toBe(turnOrder[0]);
  });

  it('keeps rooms separate', async () => {
    const one = await createGame('Ann');
    const two = await createGame('Ben');
    const roomOne = await joinRoom(one);
    const roomTwo = await joinRoom(two);
    const mark = roomTwo.events.length;
    const markOne = roomOne.events.length;
    await addEntry(one, 'Ann', 'Only in game one');
    await roomOne.next('entriesUpdated', markOne);
    await new Promise(r => setTimeout(r, 200));
    expect(roomTwo.events.slice(mark)).toEqual([]);
  });
});

describe('host controls', () => {
  const startAs = (gameId: string, token: string) =>
    api('POST', `/api/games/${gameId}/start`, undefined, {'x-host-token': token});

  async function gameWithPlayers() {
    const gameId = await createGame('Ann');
    for (const name of ['Ann', 'Ben', 'Cy', 'Di']) await addEntry(gameId, name, `${name}'s answer`);
    return gameId;
  }

  it('returns the host token once and never exposes it via GET', async () => {
    const gameId = await createGame('Ann');
    expect(hostTokens.get(gameId)).toEqual(expect.any(String));
    expect(await game(gameId)).not.toHaveProperty('hostToken');
  });

  it('rejects start and reset without the host token (403) and changes nothing', async () => {
    const gameId = await gameWithPlayers();
    hostTokens.delete(gameId); // calls below go out with no token unless a header is given
    expect((await api('POST', `/api/games/${gameId}/start`)).status).toBe(403);
    expect((await startAs(gameId, 'wrong-token')).status).toBe(403);
    expect((await game(gameId)).started).toBeUndefined();
    expect((await entries(gameId)).every(e => e.revealed === false)).toBe(true);

    expect((await api('POST', `/api/games/${gameId}/reset`, {question: 'Hijack'})).status).toBe(403);
    expect((await api('POST', `/api/games/${gameId}/reset`, {question: 'Hijack'}, {'x-host-token': 'nope'})).status).toBe(403);
    expect(await entries(gameId)).toHaveLength(4);
    expect((await game(gameId)).question).toBe('What is your favorite thing?');
  });

  it('returns 409 for a second start and leaves the turn order alone', async () => {
    const gameId = await gameWithPlayers();
    expect((await api('POST', `/api/games/${gameId}/start`)).status).toBe(200);
    const {turnOrder} = await game(gameId);

    for (let i = 0; i < 5; i++) {
      expect((await api('POST', `/api/games/${gameId}/start`)).status).toBe(409);
    }
    expect((await game(gameId)).turnOrder).toEqual(turnOrder);
  });

  it('lets only one of several simultaneous starts win', async () => {
    const gameId = await gameWithPlayers();
    const results = await Promise.all([1, 2, 3, 4].map(() => api('POST', `/api/games/${gameId}/start`)));
    expect(results.filter(r => r.status === 200)).toHaveLength(1);
    expect(results.filter(r => r.status === 409)).toHaveLength(3);
  });

  it('returns 404 when starting or resetting an unknown game', async () => {
    expect((await api('POST', '/api/games/NOPE/start', undefined, {'x-host-token': 'x'})).status).toBe(404);
    expect((await api('POST', '/api/games/NOPE/reset', {}, {'x-host-token': 'x'})).status).toBe(404);
  });
});

describe('expiry', () => {
  // DynamoDB's TTL deletes items once expiresAt passes; every write pushes it a day out
  const aDayFromNow = () => {
    const now = Math.floor(Date.now() / 1000);
    return expect.toSatisfy((t: number) => t >= now + 86400 - 5 && t <= now + 86400 + 5);
  };

  it('stamps every game, answer and score a day ahead', async () => {
    const gameId = await createGame('Ann');
    expect((await game(gameId)).expiresAt).toEqual(aDayFromNow());
    await addEntry(gameId, 'Ann', 'Mine');
    await addEntry(gameId, 'Ben', 'Yours');
    expect((await entries(gameId)).map(e => e.expiresAt)).toEqual([aDayFromNow(), aDayFromNow()]);

    await api('POST', `/api/games/${gameId}/start`);
    const {turnOrder} = await game(gameId);
    const target = (await entries(gameId)).find(e => e.authorName !== turnOrder[0]);
    await api('POST', `/api/games/${gameId}/entries/${target.entryId}/guess`,
      {guesserName: turnOrder[0], guess: target.authorName});
    expect((await scores(gameId))[0].expiresAt).toEqual(aDayFromNow());
  });

  it('pushes a game\'s expiry back when it is played again', async () => {
    const gameId = await createGame('Ann');
    const created = (await game(gameId)).expiresAt;
    await new Promise(r => setTimeout(r, 1100));
    await api('POST', `/api/games/${gameId}/reset`, {question: 'Round two'});
    expect((await game(gameId)).expiresAt).toBeGreaterThan(created);
  });
});

describe('guess validation', () => {
  it('returns 404 for an unknown answer', async () => {
    // The guesser must be on turn for the entry lookup to be reached.
    const gameId = await createGame();
    await addEntry(gameId, 'Ann', 'Something');
    await addEntry(gameId, 'Ben', 'Something else');
    await api('POST', `/api/games/${gameId}/start`);
    const [onTurn] = (await game(gameId)).turnOrder;
    const {status} = await api('POST', `/api/games/${gameId}/entries/not-an-entry/guess`,
      {guesserName: onTurn, guess: 'Ben'});
    expect(status).toBe(404);
  });

  it('returns 400 for a guesser who is not playing', async () => {
    const gameId = await createGame();
    const entryId = await addEntry(gameId, 'Ann', 'Something');
    await addEntry(gameId, 'Ben', 'Something else');
    await api('POST', `/api/games/${gameId}/start`);
    const {status} = await api('POST', `/api/games/${gameId}/entries/${entryId}/guess`,
      {guesserName: 'Mallory', guess: 'Ann'});
    expect(status).toBe(400);
    expect((await entries(gameId)).find(e => e.entryId === entryId).guessed).toBeUndefined();
  });
});

describe('start validation', () => {
  it('rejects a game with no entries (400) and leaves it unstarted', async () => {
    const gameId = await createGame('Ann');
    const {status, data} = await api('POST', `/api/games/${gameId}/start`);
    expect(status).toBe(400);
    expect(data.error).toEqual(expect.any(String));
    expect((await game(gameId)).started).toBeUndefined();
  });

  it('rejects a single player (400) and leaves it unstarted', async () => {
    const gameId = await createGame('Ann');
    await addEntry(gameId, 'Ann', 'Alone');
    const {status, data} = await api('POST', `/api/games/${gameId}/start`);
    expect(status).toBe(400);
    expect(data.error).toBe('Need at least 2 players to start');
    expect((await game(gameId)).started).toBeUndefined();
    expect((await entries(gameId)).every(e => e.revealed === false)).toBe(true);
  });

  it('still answers 403 before the entry checks', async () => {
    const gameId = await createGame('Ann');
    hostTokens.delete(gameId);
    expect((await api('POST', `/api/games/${gameId}/start`)).status).toBe(403);
  });

  it('still answers 409 for an already started game', async () => {
    const gameId = await createGame('Ann');
    await addEntry(gameId, 'Ann', 'One');
    await addEntry(gameId, 'Ben', 'Two');
    expect((await api('POST', `/api/games/${gameId}/start`)).status).toBe(200);
    expect((await api('POST', `/api/games/${gameId}/start`)).status).toBe(409);
  });

  it('starts once a second player has answered', async () => {
    const gameId = await createGame('Ann');
    await addEntry(gameId, 'Ann', 'One');
    expect((await api('POST', `/api/games/${gameId}/start`)).status).toBe(400);
    await addEntry(gameId, 'Ben', 'Two');
    expect((await api('POST', `/api/games/${gameId}/start`)).status).toBe(200);
  });
});

describe('guess rules', () => {
  const guessUrl = (gameId: string, entryId: string) => `/api/games/${gameId}/entries/${entryId}/guess`;

  async function started(names = ['Ann', 'Ben', 'Cy']) {
    const gameId = await createGame('Ann');
    const ids: Record<string, string> = {};
    for (const name of names) ids[name] = await addEntry(gameId, name, `${name}'s answer`);
    await api('POST', `/api/games/${gameId}/start`);
    const turnOrder: string[] = (await game(gameId)).turnOrder;
    return {gameId, ids, turnOrder};
  }

  it('rejects a guess out of turn (409) and changes nothing', async () => {
    const {gameId, ids, turnOrder} = await started();
    const offTurn = turnOrder[1];
    const target = turnOrder.find(n => n !== offTurn)!;
    const before = await game(gameId);
    const {status, data} = await api('POST', guessUrl(gameId, ids[target]), {guesserName: offTurn, guess: target});
    expect(status).toBe(409);
    expect(data.error).toEqual(expect.any(String));
    const after = await game(gameId);
    expect(after.turnOrder).toEqual(turnOrder);
    expect(after.lastTurn).toEqual(before.lastTurn);
    expect((await entries(gameId)).every(e => e.guessed === undefined)).toBe(true);
    expect(await scores(gameId)).toEqual([]);
  });

  it('keeps 400 for a guesser who is not in the turn order', async () => {
    const {gameId, ids} = await started();
    const {status} = await api('POST', guessUrl(gameId, ids.Ann), {guesserName: 'Mallory', guess: 'Ann'});
    expect(status).toBe(400);
  });

  it('rejects guessing your own entry (400) while others remain, with no point', async () => {
    const {gameId, ids, turnOrder} = await started();
    const me = turnOrder[0];
    const {status, data} = await api('POST', guessUrl(gameId, ids[me]), {guesserName: me, guess: me});
    expect(status).toBe(400);
    expect(data.error).toEqual(expect.any(String));
    expect(await scores(gameId)).toEqual([]);
    expect((await game(gameId)).turnOrder).toEqual(turnOrder);
    expect((await entries(gameId)).find(e => e.entryId === ids[me]).guessed).toBeUndefined();
  });

  it('rejects naming yourself as the author of another entry (400) while others remain', async () => {
    const {gameId, ids, turnOrder} = await started();
    const me = turnOrder[0];
    const other = turnOrder.find(n => n !== me)!;
    const {status} = await api('POST', guessUrl(gameId, ids[other]), {guesserName: me, guess: me});
    expect(status).toBe(400);
    expect((await game(gameId)).turnOrder).toEqual(turnOrder);
  });

  it('rejects a repeat guess on a solved entry (409) with no second point', async () => {
    const {gameId, ids, turnOrder} = await started(['Ann', 'Ben', 'Cy', 'Di']);
    const first = turnOrder[0];
    const target = turnOrder.find(n => n !== first)!;
    expect((await api('POST', guessUrl(gameId, ids[target]), {guesserName: first, guess: target})).status).toBe(200);
    const orderAfter = (await game(gameId)).turnOrder;

    const again = await api('POST', guessUrl(gameId, ids[target]), {guesserName: first, guess: target});
    expect(again.status).toBe(409);
    expect(await scores(gameId)).toEqual([expect.objectContaining({playerName: first, score: 1})]);
    expect((await game(gameId)).turnOrder).toEqual(orderAfter);
  });

  it('awards one point when two guesses on one entry race', async () => {
    const {gameId, ids, turnOrder} = await started(['Ann', 'Ben', 'Cy', 'Di']);
    const first = turnOrder[0];
    const target = turnOrder.find(n => n !== first)!;
    const results = await Promise.all([1, 2, 3, 4].map(() =>
      api('POST', guessUrl(gameId, ids[target]), {guesserName: first, guess: target})));
    expect(results.filter(r => r.status === 200)).toHaveLength(1);
    expect(results.filter(r => r.status === 409)).toHaveLength(3);
    expect(await scores(gameId)).toEqual([expect.objectContaining({playerName: first, score: 1})]);
    const order = (await game(gameId)).turnOrder as string[];
    expect(order).toEqual(turnOrder.filter(n => n !== target));
  });

  it('never loses a turn-order change when a guess races a skip or a removal (#31)', async () => {
    for (const hostAction of ['skip', 'remove'] as const) {
      const {gameId, ids, turnOrder} = await started(['Ann', 'Ben', 'Cy', 'Di']);
      const first = turnOrder[0];
      const target = turnOrder[1];
      const removed = turnOrder[3];
      const [guessRes, hostRes] = await Promise.all([
        api('POST', guessUrl(gameId, ids[target]), {guesserName: first, guess: target}),
        hostAction === 'skip'
          ? api('POST', `/api/games/${gameId}/skip-turn`)
          : api('DELETE', `/api/games/${gameId}/players/${removed}`)
      ]);
      // Whichever interleaving happens, each request either took effect fully or got a 409.
      expect([200, 409]).toContain(guessRes.status);
      expect([200, 409]).toContain(hostRes.status);
      let expected = turnOrder;
      if (guessRes.status === 200) expected = expected.filter(n => n !== target);
      if (hostRes.status === 200) {
        expected = hostAction === 'skip'
          ? (expected.length > 1 ? [...expected.slice(1), expected[0]] : expected)
          : expected.filter(n => n !== removed);
      }
      expect((await game(gameId)).turnOrder).toEqual(expected);
      expect(await scores(gameId)).toHaveLength(guessRes.status === 200 ? 1 : 0);
    }
  });
});

describe('answer validation', () => {
  const post = (gameId: string, body: object) => api('POST', `/api/games/${gameId}/entries`, body);

  it('rejects empty, blank and non-text names and answers', async () => {
    const gameId = await createGame();
    for (const body of [
      {authorName: '', text: 'x'}, {authorName: '   ', text: 'x'},
      {authorName: 'Ann', text: ''}, {authorName: 'Ann', text: '  \n '},
      {authorName: 'Ann'}, {text: 'x'}, {authorName: 42, text: 'x'}, {authorName: 'Ann', text: ['x']},
    ]) {
      const {status, data} = await post(gameId, body);
      expect(status, JSON.stringify(body)).toBe(400);
      expect(data.error).toEqual(expect.any(String));
    }
    expect(await entries(gameId)).toEqual([]);
  });

  it('rejects oversized names and answers but accepts the limits', async () => {
    const gameId = await createGame();
    const tooLongName = await post(gameId, {authorName: 'n'.repeat(31), text: 'x'});
    expect(tooLongName.status).toBe(400);
    expect(tooLongName.data.error).toMatch(/30/);
    const tooLongText = await post(gameId, {authorName: 'Ann', text: 't'.repeat(201)});
    expect(tooLongText.status).toBe(400);
    expect(tooLongText.data.error).toMatch(/200/);
    expect((await post(gameId, {authorName: 'n'.repeat(30), text: 't'.repeat(200)})).status).toBe(200);
  });

  it('trims names and answers', async () => {
    const gameId = await createGame();
    await addEntry(gameId, '  Ann ', '  Pizza  ');
    expect(await entries(gameId)).toMatchObject([{authorName: 'Ann', text: 'Pizza'}]);
  });

  it('rejects a duplicate name (case-insensitive) and keeps the first answer', async () => {
    const gameId = await createGame();
    await addEntry(gameId, 'Ann', 'Pizza');
    const dupe = await post(gameId, {authorName: 'Ann', text: 'Tacos'});
    expect(dupe.status).toBe(409);
    expect(dupe.data.error).toMatch(/taken/);
    expect((await post(gameId, {authorName: ' ann ', text: 'Tacos'})).status).toBe(409);
    await addEntry(gameId, 'Ben', 'Soup');
    expect(await entries(gameId)).toHaveLength(2);
    expect((await entries(gameId)).find(e => e.authorName === 'Ann').text).toBe('Pizza');
  });

  it('returns 404 for an unknown game', async () => {
    const {status} = await post('ZZZZ', {authorName: 'Ann', text: 'x'});
    expect(status).toBe(404);
    expect(await entries('ZZZZ')).toEqual([]);
  });

  it('rejects answers once the game has started', async () => {
    const gameId = await createGame();
    await addEntry(gameId, 'Ann', 'Pizza');
    await addEntry(gameId, 'Cy', 'Tea');
    await api('POST', `/api/games/${gameId}/start`);
    const late = await post(gameId, {authorName: 'Ben', text: 'Soup'});
    expect(late.status).toBe(400);
    expect(late.data.error).toMatch(/started/);
    const again = await post(gameId, {authorName: 'Ann', text: 'Changed'});
    expect(again.status).toBe(400);
    expect((await entries(gameId)).map(e => e.text).sort()).toEqual(['Pizza', 'Tea']);
  });
});

describe('finishing a round', () => {
  it('plays to the end: the turn order empties and the scores add up', async () => {
    const gameId = await createGame('Ann');
    const room = await joinRoom(gameId);
    const ann = await addEntry(gameId, 'Ann', 'Mine');
    const ben = await addEntry(gameId, 'Ben', 'Theirs');
    await api('POST', `/api/games/${gameId}/start`);
    const first = (await game(gameId)).turnOrder[0] as string;
    const [firstEntry, otherEntry] = first === 'Ann' ? [ann, ben] : [ben, ann];
    const other = first === 'Ann' ? 'Ben' : 'Ann';

    // Getting it right means going again, now with only your own answer left
    let mark = room.events.length;
    await api('POST', `/api/games/${gameId}/entries/${otherEntry}/guess`, {guesserName: first, guess: other});
    expect(await room.next('nextTurn', mark)).toEqual({currentPlayer: first, turnOrder: [first]});

    // The last player guesses their own answer, which ends the round
    mark = room.events.length;
    const last = await api('POST', `/api/games/${gameId}/entries/${firstEntry}/guess`,
      {guesserName: first, guess: first});
    expect(last.data).toEqual({isCorrect: true});
    expect(await room.next('nextTurn', mark)).toEqual({currentPlayer: null, turnOrder: []});
    expect((await entries(gameId)).every(e => e.guessed === true)).toBe(true);
    expect(await scores(gameId)).toEqual([expect.objectContaining({playerName: first, score: 2})]);
  });

  it('keeps the turn with the only player left after a wrong guess', async () => {
    const gameId = await createGame('Ann');
    const ann = await addEntry(gameId, 'Ann', 'Mine');
    const ben = await addEntry(gameId, 'Ben', 'Theirs');
    await api('POST', `/api/games/${gameId}/start`);
    const first = (await game(gameId)).turnOrder[0] as string;
    await api('POST', `/api/games/${gameId}/entries/${first === 'Ann' ? ben : ann}/guess`,
      {guesserName: first, guess: first === 'Ann' ? 'Ben' : 'Ann'});
    const own = await api('POST', `/api/games/${gameId}/entries/${first === 'Ann' ? ann : ben}/guess`,
      {guesserName: first, guess: 'Nobody'});
    expect(own.data).toEqual({isCorrect: false});
    expect((await game(gameId)).turnOrder).toEqual([first]);
    expect(await scores(gameId)).toEqual([expect.objectContaining({playerName: first, score: 1})]);
  });

  it('gives each player one place in the turn order, since a second answer from the same name is rejected', async () => {
    const gameId = await createGame('Ann');
    await addEntry(gameId, 'Ann', 'One');
    const second = await api('POST', `/api/games/${gameId}/entries`, {authorName: 'Ann', text: 'Two'});
    expect(second.status).toBe(409);
    await addEntry(gameId, 'Ben', 'Three');
    await api('POST', `/api/games/${gameId}/start`);
    expect([...(await game(gameId)).turnOrder].sort()).toEqual(['Ann', 'Ben']);
  });

  it('keeps scores across rounds and adds to them', async () => {
    const gameId = await createGame('Ann');
    for (let round = 1; round <= 2; round++) {
      const a = await addEntry(gameId, 'Ann', `Ann ${round}`);
      const b = await addEntry(gameId, 'Ben', `Ben ${round}`);
      await api('POST', `/api/games/${gameId}/start`);
      const first = (await game(gameId)).turnOrder[0] as string;
      await api('POST', `/api/games/${gameId}/entries/${first === 'Ann' ? b : a}/guess`,
        {guesserName: first, guess: first === 'Ann' ? 'Ben' : 'Ann'});
      if (round === 1) await api('POST', `/api/games/${gameId}/reset`, {question: 'Round two'});
      else expect((await scores(gameId)).reduce((sum, s) => sum + s.score, 0)).toBe(2);
    }
  });
});

describe('entry privacy (#29)', () => {
  async function lobby() {
    const gameId = await createGame('Host');
    const ids = {
      ann: (await api('POST', `/api/games/${gameId}/entries`, {authorName: 'Ann', text: 'Secret A'}, {'x-player-token': 'tok-ann'})).data.entryId as string,
      ben: (await api('POST', `/api/games/${gameId}/entries`, {authorName: 'Ben', text: 'Secret B'}, {'x-player-token': 'tok-ben'})).data.entryId as string,
      cy: (await api('POST', `/api/games/${gameId}/entries`, {authorName: 'Cy', text: 'Secret C'}, {'x-player-token': 'tok-cy'})).data.entryId as string,
    };
    return {gameId, ids};
  }

  it('before the game starts shows only your own text and author, flagged mine', async () => {
    const {gameId, ids} = await lobby();
    const list = await entriesAs(gameId, 'tok-ann');
    expect(list).toHaveLength(3);
    const mine = list.find(e => e.entryId === ids.ann);
    expect(mine).toMatchObject({gameId, authorName: 'Ann', text: 'Secret A', mine: true, revealed: false, guessed: false});
    for (const other of list.filter(e => e.entryId !== ids.ann)) {
      expect(other).toMatchObject({gameId, mine: false, revealed: false, guessed: false});
      expect(other).not.toHaveProperty('text');
      expect(other).not.toHaveProperty('authorName');
    }
  });

  it('shows a spectator or a wrong token no text, author or mine flag before the start', async () => {
    const {gameId} = await lobby();
    for (const list of [await entriesAs(gameId), await entriesAs(gameId, 'tok-unknown')]) {
      expect(list).toHaveLength(3);
      for (const e of list) {
        expect(e).not.toHaveProperty('text');
        expect(e).not.toHaveProperty('authorName');
        expect(e.mine).toBe(false);
      }
    }
  });

  it('never returns the author token, before or after the start', async () => {
    const {gameId} = await lobby();
    const check = async () => {
      for (const token of [undefined, 'tok-ann']) {
        for (const e of await entriesAs(gameId, token)) expect(e).not.toHaveProperty('authorToken');
      }
    };
    await check();
    await api('POST', `/api/games/${gameId}/start`);
    await check();
  });

  it('after the start shows every answer but only reveals authors that were guessed, plus your own', async () => {
    const {gameId, ids} = await lobby();
    await api('POST', `/api/games/${gameId}/start`);
    const spectator = await entriesAs(gameId);
    expect(spectator.map(e => e.text).sort()).toEqual(['Secret A', 'Secret B', 'Secret C']);
    for (const e of spectator) {
      expect(e).not.toHaveProperty('authorName');
      expect(e).toMatchObject({revealed: true, guessed: false, mine: false});
    }

    const asBen = await entriesAs(gameId, 'tok-ben');
    expect(asBen.find(e => e.entryId === ids.ben)).toMatchObject({authorName: 'Ben', mine: true});
    expect(asBen.find(e => e.entryId === ids.ann)).not.toHaveProperty('authorName');
  });

  it('reveals the author once an answer is guessed correctly', async () => {
    const {gameId, ids} = await lobby();
    await api('POST', `/api/games/${gameId}/start`);
    const first = (await game(gameId)).turnOrder[0] as string;
    const names: Record<string, 'ann' | 'ben' | 'cy'> = {Ann: 'ann', Ben: 'ben', Cy: 'cy'};
    const targetName = Object.keys(names).find(n => n !== first)!;
    const guess = await api('POST', `/api/games/${gameId}/entries/${ids[names[targetName]]}/guess`,
      {guesserName: first, guess: targetName}, {'x-player-token': `tok-${names[first]}`});
    expect(guess.data).toEqual({isCorrect: true});

    const spectator = await entriesAs(gameId);
    expect(spectator.find(e => e.entryId === ids[names[targetName]])).toMatchObject({guessed: true, authorName: targetName});
    expect(spectator.filter(e => e.guessed !== true).every(e => !('authorName' in e))).toBe(true);
  });

  it('keeps a wrong guess from naming the real author', async () => {
    const {gameId, ids} = await lobby();
    const room = await joinRoom(gameId);
    await api('POST', `/api/games/${gameId}/start`);
    const first = (await game(gameId)).turnOrder[0] as string;
    const names: Record<string, 'ann' | 'ben' | 'cy'> = {Ann: 'ann', Ben: 'ben', Cy: 'cy'};
    const targetName = Object.keys(names).find(n => n !== first)!;
    const mark = room.events.length;
    const wrong = await api('POST', `/api/games/${gameId}/entries/${ids[names[targetName]]}/guess`,
      {guesserName: first, guess: 'Nobody'}, {'x-player-token': `tok-${names[first]}`});
    expect(wrong.data).toEqual({isCorrect: false});
    const payload = await room.next('wrongAnswer', mark);
    expect(payload).not.toHaveProperty('authorName');
    expect(payload).toEqual({playerName: first, guess: expect.stringMatching(/^Secret /)});
    expect((await entriesAs(gameId)).every(e => e.guessed === false && !('authorName' in e))).toBe(true);
  });

  it('returns the player names with the game once it starts', async () => {
    const {gameId} = await lobby();
    expect(await game(gameId)).not.toHaveProperty('players');
    await api('POST', `/api/games/${gameId}/start`);
    const data = await game(gameId);
    expect([...data.players].sort()).toEqual(['Ann', 'Ben', 'Cy']);
    expect(data).not.toHaveProperty('hostToken');
    expect(data).not.toHaveProperty('playerTokens');
  });

  it('still binds and checks player tokens with the single-update token write', async () => {
    const {gameId, ids} = await lobby();
    const stolen = await api('PATCH', `/api/games/${gameId}/entries/${ids.ann}`, {text: 'Hacked'}, {'x-player-token': 'tok-ben'});
    expect(stolen.status).toBe(403);
    const dupe = await api('POST', `/api/games/${gameId}/entries`, {authorName: 'ann', text: 'x'}, {'x-player-token': 'tok-ben'});
    expect(dupe.status).toBe(403);
  });
});

describe('unknown games', () => {
  it('lists no entries or scores, and 404s the game itself', async () => {
    expect(await api('GET', '/api/games/ZZZZ/entries')).toEqual({status: 200, data: []});
    expect((await api('GET', '/api/games/ZZZZ/scores')).data).toEqual([]);
    expect(await api('GET', '/api/games/ZZZZ')).toEqual({status: 404, data: {error: 'Game not found'}});
  });
});

describe('request errors', () => {
  const raw = async (body: string) => {
    const response = await fetch(`${baseUrl}/api/createGame`, {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body
    });
    return {status: response.status, type: response.headers.get('content-type'), data: await response.json()};
  };

  it('answers malformed JSON with a JSON 400', async () => {
    const res = await raw('{"name": ');
    expect(res.status).toBe(400);
    expect(res.type).toContain('application/json');
    expect(res.data).toEqual({error: 'Request body must be valid JSON'});
  });

  it('answers an oversize body with a JSON 413', async () => {
    const res = await raw(JSON.stringify({name: 'Ann', question: 'x'.repeat(20_000)}));
    expect(res.status).toBe(413);
    expect(res.type).toContain('application/json');
    expect(res.data).toEqual({error: 'Request body is too large'});
  });
});

describe('guess and remove-player status codes', () => {
  async function started() {
    const gameId = await createGame('Ann');
    const ids: Record<string, string> = {};
    for (const name of ['Ann', 'Ben', 'Cy']) ids[name] = await addEntry(gameId, name, `${name}'s answer`);
    await api('POST', `/api/games/${gameId}/start`);
    return {gameId, ids, turnOrder: (await game(gameId)).turnOrder as string[]};
  }
  const guessUrl = (gameId: string, entryId: string) => `/api/games/${gameId}/entries/${entryId}/guess`;

  it('404s a guess in an unknown game', async () => {
    const res = await api('POST', guessUrl('ZZZZ', 'nope'), {guesserName: 'Ann', guess: 'Ben'});
    expect(res).toEqual({status: 404, data: {error: 'Game not found'}});
  });

  it('reports the turn error before an unknown entry', async () => {
    const {gameId, turnOrder} = await started();
    const offTurn = await api('POST', guessUrl(gameId, 'nope'), {guesserName: turnOrder[1], guess: 'Ann'});
    expect(offTurn.status).toBe(409);
    const stranger = await api('POST', guessUrl(gameId, 'nope'), {guesserName: 'Mallory', guess: 'Ann'});
    expect(stranger.status).toBe(400);
    const onTurn = await api('POST', guessUrl(gameId, 'nope'), {guesserName: turnOrder[0], guess: 'Ann'});
    expect(onTurn).toEqual({status: 404, data: {error: 'Entry not found'}});
  });

  it('404s removing a player who is not in the turn order and leaves the order alone', async () => {
    const {gameId, turnOrder} = await started();
    const res = await api('DELETE', `/api/games/${gameId}/players/Nobody`);
    expect(res).toEqual({status: 404, data: {error: 'Player not found'}});
    expect((await game(gameId)).turnOrder).toEqual(turnOrder);
    const again = await api('DELETE', `/api/games/${gameId}/players/${turnOrder[2]}`);
    expect(again.status).toBe(200);
    expect((await api('DELETE', `/api/games/${gameId}/players/${turnOrder[2]}`)).status).toBe(404);
  });
});

describe('player identity (#67)', () => {
  it('claims a name with a token, allows reuse with matching token, rejects mismatch with 403', async () => {
    const gameId = await createGame('Host');
    const token1 = 'device-token-1';
    const token2 = 'device-token-2';

    // Claim name Ann with token1
    const res1 = await api('POST', `/api/games/${gameId}/entries`, {authorName: 'Ann', text: 'Tacos'}, {'x-player-token': token1});
    expect(res1.status).toBe(200);

    // Mismatched token trying to submit as Ann gets 403
    const res2 = await api('POST', `/api/games/${gameId}/entries`, {authorName: 'ann', text: 'Burritos'}, {'x-player-token': token2});
    expect(res2.status).toBe(403);
    expect(res2.data).toEqual({error: 'A player with this name already exists in this game'});

    // Ben submits with token2
    const benRes = await api('POST', `/api/games/${gameId}/entries`, {authorName: 'Ben', text: 'Pizza'}, {'x-player-token': token2});
    expect(benRes.status).toBe(200);

    // Start game
    await api('POST', `/api/games/${gameId}/start`);
    const g = (await game(gameId));
    const first = g.turnOrder[0] as string;
    const entryId = first === 'Ann' ? benRes.data.entryId : res1.data.entryId;

    // Guessing as the first player with wrong token gets 403
    const badGuess = await api('POST', `/api/games/${gameId}/entries/${entryId}/guess`,
      {guesserName: first, guess: 'Pizza'},
      {'x-player-token': first === 'Ann' ? token2 : token1});
    expect(badGuess.status).toBe(403);
    expect(badGuess.data).toEqual({error: 'Player token mismatch'});

    // Guessing with matching token succeeds
    const goodGuess = await api('POST', `/api/games/${gameId}/entries/${entryId}/guess`,
      {guesserName: first, guess: first === 'Ann' ? 'Ben' : 'Ann'},
      {'x-player-token': first === 'Ann' ? token1 : token2});
    expect(goodGuess.status).toBe(200);
  });

  it('rejects entries and guesses when x-player-token is omitted or mismatched for an existing player', async () => {
    const gameId = await createGame('Host');
    const token = 'token-alice';

    // Alice creates an entry with her token
    const res = await api('POST', `/api/games/${gameId}/entries`, {authorName: 'Alice', text: 'Apples'}, {'x-player-token': token});
    expect(res.status).toBe(200);

    // Omitting x-player-token when submitting as Alice is rejected with 403
    const omitEntry = await api('POST', `/api/games/${gameId}/entries`, {authorName: 'Alice', text: 'More Apples'});
    expect(omitEntry.status).toBe(403);
    expect(omitEntry.data).toEqual({error: 'A player with this name already exists in this game'});

    // Wrong x-player-token when submitting as Alice is rejected with 403
    const wrongEntry = await api('POST', `/api/games/${gameId}/entries`, {authorName: 'alice', text: 'Green Apples'}, {'x-player-token': 'wrong-token'});
    expect(wrongEntry.status).toBe(403);
    expect(wrongEntry.data).toEqual({error: 'A player with this name already exists in this game'});

    // Bob creates an entry
    const bobRes = await api('POST', `/api/games/${gameId}/entries`, {authorName: 'Bob', text: 'Bananas'}, {'x-player-token': 'token-bob'});
    expect(bobRes.status).toBe(200);

    // Start game
    await api('POST', `/api/games/${gameId}/start`);
    const g = await game(gameId);
    const first = g.turnOrder[0] as string;
    const targetEntryId = first === 'Alice' ? bobRes.data.entryId : res.data.entryId;

    // Omitting x-player-token on guess is rejected with 403
    const omitGuess = await api('POST', `/api/games/${gameId}/entries/${targetEntryId}/guess`, {
      guesserName: first,
      guess: 'Bananas'
    });
    expect(omitGuess.status).toBe(403);
    expect(omitGuess.data).toEqual({error: 'Player token mismatch'});

    // Wrong x-player-token on guess is rejected with 403
    const wrongGuess = await api('POST', `/api/games/${gameId}/entries/${targetEntryId}/guess`, {
      guesserName: first,
      guess: 'Bananas'
    }, {'x-player-token': 'wrong-token'});
    expect(wrongGuess.status).toBe(403);
    expect(wrongGuess.data).toEqual({error: 'Player token mismatch'});
  });
});

describe('editing and deleting entries (#52)', () => {
  it('allows author to patch and delete before game starts, emits entriesUpdated', async () => {
    const gameId = await createGame('Host');
    const room = await joinRoom(gameId);
    const token = 'author-token';
    const otherToken = 'other-token';

    const addRes = await api('POST', `/api/games/${gameId}/entries`, {authorName: 'Ann', text: 'Initial'}, {'x-player-token': token});
    const entryId = addRes.data.entryId;

    // Missing or wrong author token cannot edit
    const noTokenEdit = await api('PATCH', `/api/games/${gameId}/entries/${entryId}`, {text: 'Hacked'});
    expect(noTokenEdit.status).toBe(403);
    expect(noTokenEdit.data).toEqual({error: 'Only the author can edit this entry'});

    const badEdit = await api('PATCH', `/api/games/${gameId}/entries/${entryId}`, {text: 'Hacked'}, {'x-player-token': otherToken});
    expect(badEdit.status).toBe(403);
    expect(badEdit.data).toEqual({error: 'Only the author can edit this entry'});

    // Author edits successfully
    const mark1 = room.events.length;
    const editRes = await api('PATCH', `/api/games/${gameId}/entries/${entryId}`, {text: 'Updated Text'}, {'x-player-token': token});
    expect(editRes.status).toBe(200);
    await room.next('entriesUpdated', mark1);
    expect((await entriesAs(gameId, token)).find(e => e.entryId === entryId).text).toBe('Updated Text');

    // Missing or wrong author token cannot delete
    const noTokenDel = await api('DELETE', `/api/games/${gameId}/entries/${entryId}`);
    expect(noTokenDel.status).toBe(403);
    expect(noTokenDel.data).toEqual({error: 'Only the author can delete this entry'});

    const badDel = await api('DELETE', `/api/games/${gameId}/entries/${entryId}`, undefined, {'x-player-token': otherToken});
    expect(badDel.status).toBe(403);
    expect(badDel.data).toEqual({error: 'Only the author can delete this entry'});

    // Author deletes entry
    const mark2 = room.events.length;
    const delRes = await api('DELETE', `/api/games/${gameId}/entries/${entryId}`, undefined, {'x-player-token': token});
    expect(delRes.status).toBe(200);
    await room.next('entriesUpdated', mark2);
    expect((await entriesAs(gameId, token)).find(e => e.entryId === entryId)).toBeUndefined();
  });
});

describe('skip turn and remove player (#68)', () => {
  it('allows host to skip a turn and remove players', async () => {
    const gameId = await createGame('Host');
    const room = await joinRoom(gameId);
    await addEntry(gameId, 'Ann', 'One');
    await addEntry(gameId, 'Ben', 'Two');
    await addEntry(gameId, 'Carol', 'Three');
    await api('POST', `/api/games/${gameId}/start`);

    const g1 = await game(gameId);
    const first = g1.turnOrder[0];

    // Non-host cannot skip
    const badSkip = await api('POST', `/api/games/${gameId}/skip-turn`, undefined, {'x-host-token': 'wrong'});
    expect(badSkip.status).toBe(403);

    // Host skips turn
    const mark1 = room.events.length;
    const skipRes = await api('POST', `/api/games/${gameId}/skip-turn`);
    expect(skipRes.status).toBe(200);
    const next1 = await room.next('nextTurn', mark1);
    expect(next1.turnOrder[next1.turnOrder.length - 1]).toBe(first);

    // Host removes a player
    const mark2 = room.events.length;
    const remRes = await api('DELETE', `/api/games/${gameId}/players/${first}`);
    expect(remRes.status).toBe(200);
    const remEvt1 = await room.next('playerRemoved', mark2);
    expect(remEvt1).toEqual({playerName: first, turnOrder: remRes.data.turnOrder});
    const next2 = await room.next('nextTurn', mark2);
    expect(next2.turnOrder.includes(first)).toBe(false);
    expect(next2.turnOrder.length).toBe(2);

    // Host removes another player down to the last remaining player (spec #68)
    const second = next2.turnOrder[0];
    const mark3 = room.events.length;
    const remRes2 = await api('DELETE', `/api/games/${gameId}/players/${second}`);
    expect(remRes2.status).toBe(200);
    const remEvt2 = await room.next('playerRemoved', mark3);
    expect(remEvt2).toEqual({playerName: second, turnOrder: remRes2.data.turnOrder});
    const next3 = await room.next('nextTurn', mark3);
    expect(next3.turnOrder.length).toBe(1);
    expect(next3.turnOrder.includes(second)).toBe(false);
    expect(next3.currentPlayer).toBe(next3.turnOrder[0]);
  });
});

describe('spectator socket (#73)', () => {
  it('joins room and receives live updates without write participation', async () => {
    const gameId = await createGame('Host');
    const spectator = await joinRoom(gameId);

    const mark = spectator.events.length;
    await addEntry(gameId, 'Ann', 'Answer');
    await spectator.next('entriesUpdated', mark);
    expect(spectator.events.some(e => e.name === 'entriesUpdated')).toBe(true);
  });
});

describe('host handoff', () => {
  it('allows current host to transfer host privileges to another player', async () => {
    const gameId = await createGame('InitialHost');
    const room = await joinRoom(gameId);

    // Non-host cannot transfer
    const badTransfer = await api('POST', `/api/games/${gameId}/transfer-host`, {targetPlayerName: 'NewHost'}, {'x-host-token': 'invalid'});
    expect(badTransfer.status).toBe(403);

    // Host transfers to NewHost
    const mark = room.events.length;
    const res = await api('POST', `/api/games/${gameId}/transfer-host`, {targetPlayerName: 'NewHost'});
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.newHostName).toBe('NewHost');

    const event = await room.next('hostTransferred', mark);
    expect(event.newHostName).toBe('NewHost');
    expect(typeof event.hostToken).toBe('string');

    // Old host token is rejected now
    const oldHostStart = await api('POST', `/api/games/${gameId}/start`);
    expect(oldHostStart.status).toBe(403);

    // New host token succeeds
    hostTokens.set(gameId, event.hostToken);
    await addEntry(gameId, 'Player1', 'One');
    await addEntry(gameId, 'Player2', 'Two');
    const newHostStart = await api('POST', `/api/games/${gameId}/start`);
    expect(newHostStart.status).toBe(200);

    const g = await game(gameId);
    expect(g.hostName).toBe('NewHost');
  });
});

describe('request validation', () => {
  const guessUrl = (gameId: string, entryId: string) => `/api/games/${gameId}/entries/${entryId}/guess`;

  it('rejects a non-text or oversize reset question (400) and changes nothing', async () => {
    const gameId = await createGame('Host', 'Original question');
    await addEntry(gameId, 'Ann', 'Something');
    for (const question of [5, true, ['a'], {a: 1}, 'q'.repeat(201)]) {
      const {status, data} = await api('POST', `/api/games/${gameId}/reset`, {question});
      expect(status).toBe(400);
      expect(data.error).toEqual(expect.any(String));
    }
    expect((await game(gameId)).question).toBe('Original question');
    expect(await entries(gameId)).toHaveLength(1);
  });

  it('still resets to the default question when none is given', async () => {
    const gameId = await createGame('Host', 'Original question');
    expect((await api('POST', `/api/games/${gameId}/reset`, {})).status).toBe(200);
    expect((await game(gameId)).question).toBe('What is your favorite thing?');
  });

  it('returns 400, not 500, for a guess with non-text or oversize fields', async () => {
    const gameId = await createGame('Ann');
    const entryId = await addEntry(gameId, 'Ann', 'One');
    await addEntry(gameId, 'Ben', 'Two');
    await api('POST', `/api/games/${gameId}/start`);
    const bodies: object[] = [
      {}, {guesserName: 'Ann'}, {guess: 'Ben'}, {guesserName: 5, guess: 'Ben'},
      {guesserName: {a: 1}, guess: 'Ben'}, {guesserName: 'Ann', guess: ['Ben']},
      {guesserName: 'a'.repeat(31), guess: 'Ben'}, {guesserName: 'Ann', guess: 'b'.repeat(31)}
    ];
    for (const body of bodies) {
      const {status, data} = await api('POST', guessUrl(gameId, entryId), body);
      expect(status).toBe(400);
      expect(data.error).toEqual(expect.any(String));
    }
    expect((await entries(gameId)).every(e => e.guessed === undefined)).toBe(true);
  });

  it('rejects an oversize host transfer target (400)', async () => {
    const gameId = await createGame('Host');
    const {status} = await api('POST', `/api/games/${gameId}/transfer-host`, {targetPlayerName: 'x'.repeat(31)});
    expect(status).toBe(400);
    expect((await game(gameId)).hostName).toBe('Host');
  });

  it('rejects oversize ids and token headers (400)', async () => {
    const gameId = await createGame();
    expect((await api('GET', `/api/games/${'A'.repeat(100)}`)).status).toBe(400);
    expect((await api('DELETE', `/api/games/${gameId}/entries/${'e'.repeat(100)}`)).status).toBe(400);
    expect((await api('DELETE', `/api/games/${gameId}/players/${'p'.repeat(100)}`)).status).toBe(400);
    expect((await api('POST', `/api/games/${gameId}/entries`, {authorName: 'Ann', text: 'Hi'},
      {'x-player-token': 't'.repeat(200)})).status).toBe(400);
    expect((await api('POST', `/api/games/${gameId}/start`, undefined,
      {'x-host-token': 't'.repeat(200)})).status).toBe(400);
  });
});

describe('lobby answered names (#42)', () => {
  it('lists distinct, sorted author names before the start, with no text or entry link', async () => {
    const gameId = await createGame('Host');
    const add = (name: string, tok: string, text: string) =>
      api('POST', `/api/games/${gameId}/entries`, {authorName: name, text}, {'x-player-token': tok});
    expect((await game(gameId)).answeredNames).toEqual([]);
    const cy = (await add('Cy', 'tok-cy', 'Secret C')).data.entryId as string;
    await add('Ann', 'tok-ann', 'Secret A');
    await add('Ben', 'tok-ben', 'Secret B');
    const g = await game(gameId);
    expect(g.answeredNames).toEqual(['Ann', 'Ben', 'Cy']);
    expect(JSON.stringify(g)).not.toContain('Secret');
    expect(g).not.toHaveProperty('authorToken');

    await api('DELETE', `/api/games/${gameId}/entries/${cy}`, undefined, {'x-player-token': 'tok-cy'});
    expect((await game(gameId)).answeredNames).toEqual(['Ann', 'Ben']);
  });

  it('omits answeredNames once the game has started and leaves entries unchanged', async () => {
    const gameId = await createGame('Host');
    await api('POST', `/api/games/${gameId}/entries`, {authorName: 'Ann', text: 'A'}, {'x-player-token': 'tok-ann'});
    await api('POST', `/api/games/${gameId}/entries`, {authorName: 'Ben', text: 'B'}, {'x-player-token': 'tok-ben'});
    const before = await entriesAs(gameId);
    for (const e of before) expect(e).not.toHaveProperty('authorName');
    await api('POST', `/api/games/${gameId}/start`);
    expect(await game(gameId)).not.toHaveProperty('answeredNames');
  });
});

describe('unmatched routes', () => {
  it('returns 404 JSON for unknown /api routes', async () => {
    const res = await api('GET', '/api/nonexistent-route');
    expect(res.status).toBe(404);
    expect(res.data).toEqual({error: 'Not found'});
  });
});
