import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {AddressInfo} from 'net';
import {CreateTableCommand, DeleteTableCommand, DynamoDBClient} from '@aws-sdk/client-dynamodb';
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

async function api<T = any>(method: 'GET' | 'POST', path: string, body?: object): Promise<{status: number; data: T}> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? {'Content-Type': 'application/json'} : undefined,
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

async function createGame(name = 'Host', question?: string) {
  const {status, data} = await api<{gameId: string}>('POST', '/api/createGame', {name, question});
  expect(status).toBe(200);
  expect(data.gameId).toMatch(/^[A-Z]{4}$/);
  return data.gameId;
}

async function addEntry(gameId: string, authorName: string, text: string) {
  const {status, data} = await api<{entryId: string}>('POST', `/api/games/${gameId}/entries`, {authorName, text});
  expect(status).toBe(200);
  return data.entryId;
}

const entries = async (gameId: string) => (await api<any[]>('GET', `/api/games/${gameId}/entries`)).data;
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
    expect(await game(gameId)).toMatchObject({gameId, gameOwner: 'Ann', question: 'Things you find in a fridge'});
  });

  it('uses the default question when none is given', async () => {
    const gameId = await createGame('Ann');
    expect((await game(gameId)).question).toBe('What is your favorite thing?');
  });

  it('returns an empty object, entries and scores for an unknown game', async () => {
    expect(await game('ZZZZ-unknown')).toEqual({});
    expect(await entries('ZZZZ-unknown')).toEqual([]);
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
    expect((await api('POST', `/api/games/${gameId}/start`)).data).toEqual({success: true});
    const {turnOrder} = await room.next('gameStarted', mark);
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
      playerName: first, authorName: someoneElses.authorName, guess: someoneElses.text,
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
    expect(await scores(gameId)).toEqual([{gameId, playerName: second, score: 1}]);

    // A new round clears the answers and keeps the scores
    mark = room.events.length;
    expect((await api('POST', `/api/games/${gameId}/reset`, {question: '  Best pizza toppings  '})).status).toBe(200);
    await room.next('gameReset', mark);
    expect(await entries(gameId)).toEqual([]);
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

describe('guess validation', () => {
  it('returns 404 for an unknown answer', async () => {
    const gameId = await createGame();
    const {status} = await api('POST', `/api/games/${gameId}/entries/not-an-entry/guess`,
      {guesserName: 'Ann', guess: 'Ben'});
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
