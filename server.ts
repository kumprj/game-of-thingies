import express from "express";
import {v4 as uuidv4} from "uuid";
import cors from "cors";
import http from "http";
import {Server} from "socket.io";
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
const httpServer = http.createServer(app);

// 3. Initialize Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Adjust this to your frontend URL in production - is this needed?
    methods: ["GET", "POST"]
  }
});

// 4. Handle connections (optional, but good for debugging)
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // Join a room based on gameId so updates only go to relevant players
  socket.on("joinGame", (gameId) => {
    socket.join(gameId);
    console.log(`Socket ${socket.id} joined game ${gameId}`);
  });
});

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

app.get("/warmup", async (_req, res) => {
  try {
    // Optionally touch anything heavy here, e.g.:
    // await getAiClient();  // or your model init / DB init
    res.status(200).send("OK");
  } catch (err) {
    // Still respond quickly so Render counts it as traffic
    res.status(200).send("OK");
  }
});


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

  io.to(gameId).emit("entriesUpdated");
  res.json({entryId});
});

app.post('/api/games/:gameId/start', async (req, res) => {
  const {gameId} = req.params;

  try {
    // 1. Fetch entries FIRST to get the players
    const entries = await ddb.send(new QueryCommand({
      TableName: 'Entries',
      KeyConditionExpression: 'gameId = :g',
      ExpressionAttributeValues: {':g': gameId}
    }));

    // 2. Define 'shuffled' using the fetched entries
// 1. Safe access with default
    const entryItems = entries.Items || [];

// 2. Map using the safe variable
    const players = entryItems.map((e: any) => e.authorName).filter((v: any, i: number, a: any[]) => a.indexOf(v) === i);

// 3. Shuffle
    const shuffled = players.sort(() => Math.random() - 0.5);

    try {
      await ddb.send(new UpdateCommand({
        TableName: 'Games',
        Key: {gameId},
        UpdateExpression: 'SET started = :trueVal, turnOrder = :tOrder',
        // Condition: Only update if 'started' is currently false (or doesn't exist)
        ConditionExpression: 'attribute_not_exists(started) OR started = :falseVal',
        ExpressionAttributeValues: {
          ':trueVal': true,
          ':falseVal': false,
          ':tOrder': shuffled // your turn order logic
        }
      }));
    } catch (err: any) {
      if (err.name === 'ConditionalCheckFailedException') {
        console.log("Game already started, ignoring duplicate request.");
        // Optional: Return the existing game state instead of an error
        return res.json({success: true, message: "Game already started"});
      }
      throw err; // Re-throw other errors
    }


    // 4. Reveal all entries
    for (const entry of entries.Items || []) {
      await ddb.send(new UpdateCommand({
        TableName: 'Entries',
        Key: {gameId: gameId, entryId: entry.entryId},
        UpdateExpression: 'set revealed = :r',
        ExpressionAttributeValues: {':r': true}
      }));
    }

    // 5. Emit event
    io.to(gameId).emit("gameStarted", {turnOrder: shuffled});

    res.json({success: true});

  } catch (err: any) {
    console.error('Failed to start game:', err);
    res.status(500).json({error: 'Failed to start game'});
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
      UpdateExpression: 'SET question = :q, createdAt = :c, gameOwner = gameOwner, started = :started',
      ExpressionAttributeValues: {
        ':q': question?.trim() || 'What is your favorite thing?',
        ':c': new Date().toISOString(),
        ':started': false
      },
      ReturnValues: 'ALL_NEW'
    }));

    io.to(gameId).emit("gameReset");
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

app.get('/api/games/:gameId/scores', async (req, res) => {
  const {gameId} = req.params;

  try {
    const result = await ddb.send(new QueryCommand({
      TableName: 'Scores',
      KeyConditionExpression: 'gameId = :g',
      ExpressionAttributeValues: {':g': gameId},
    }));

    // Return array of { playerName, score }
    const items = (result.Items || []).map(item => ({
      playerName: item.playerName,
      score: item.score ?? 0,
    }));

    res.json(items);
  } catch (err) {
    console.error('Scores fetch error:', err);
    res.status(500).json({error: 'Failed to fetch scores'});
  }
});


app.post('/api/games/:gameId/entries/:entryId/guess', async (req, res) => {
  const {gameId, entryId} = req.params;
  const {guesserName, guess} = req.body;
  console.log(`Received guess for gameId=${gameId}, entryId=${entryId} from ${guesserName}: "${guess}"`);
  try {
    // Get the entry
    const entryResult = await ddb.send(new GetCommand({
      TableName: 'Entries',
      Key: {gameId, entryId},
    }));
    console.log("Entry result:", entryResult);
    const item = entryResult.Item;
    if (!item) {
      return res.status(404).json({error: "Entry not found"});
    }
    console.log("item is ", item);

    const isCorrect = item.authorName === guess;
    console.log("isCorrect", isCorrect);
    if (isCorrect) {

      // Start Turns
      const gameData = await ddb.send(new GetCommand({
        TableName: 'Games',
        Key: {gameId}
      }));

      let turnOrder = gameData.Item?.turnOrder || [];
      turnOrder = turnOrder.filter(name => name !== item.authorName);

      await ddb.send(new UpdateCommand({
        TableName: 'Games',
        Key: {gameId},
        UpdateExpression: 'SET turnOrder = :to',
        ExpressionAttributeValues: {':to': turnOrder}
      }));

      // End Turns

      // Mark as guessed
      await ddb.send(new UpdateCommand({
        TableName: 'Entries',
        Key: {gameId, entryId},
        UpdateExpression: 'SET guessed = :val',
        ExpressionAttributeValues: {':val': true},
      }));

      // Increment player score in Scores table
      await ddb.send(new UpdateCommand({
        TableName: 'Scores',
        Key: {gameId, playerName: guesserName},
        UpdateExpression: 'ADD score :inc',
        ExpressionAttributeValues: {':inc': 1},
      }));

      // Fetch the updated entry
      const updatedEntryResult = await ddb.send(new GetCommand({
        TableName: 'Entries',
        Key: {gameId, entryId},
      }));
      io.to(gameId).emit("scoreUpdated", {
        playerName: guesserName,
        authorName: item.authorName,
        guess: item.text
      });
      io.to(gameId).emit("nextTurn", {
        currentPlayer: turnOrder[0] || null,
        turnOrder
      });
      io.to(gameId).emit("entriesUpdated"); // Because an entry was revealed/guessed
      console.log("updatedEntryResult is ", updatedEntryResult);
      return res.json({
        isCorrect,
        entry: updatedEntryResult.Item,
      });
    } else {
      // 1. Fetch current turn order
      const gameData = await ddb.send(new GetCommand({
        TableName: 'Games',
        Key: {gameId}
      }));

      let turnOrder = gameData.Item?.turnOrder || [];

      if (turnOrder.length > 1) {
        // 2. Rotate the array: Move first player to the end
        const current = turnOrder.shift();
        turnOrder.push(current);

        // 3. Update DB
        await ddb.send(new UpdateCommand({
          TableName: 'Games',
          Key: {gameId},
          UpdateExpression: 'SET turnOrder = :to',
          ExpressionAttributeValues: {':to': turnOrder}
        }));
      }

      // 4. Emit 'wrongAnswer' AND 'nextTurn'
      io.to(gameId).emit("wrongAnswer", {
        playerName: guesserName,
        authorName: item.authorName,
        guess: item.text
      });

      io.to(gameId).emit("nextTurn", {
        currentPlayer: turnOrder[0] || null,
        turnOrder
      });

    }
    return res.json({isCorrect});

  } catch (err) {
    console.error("Guess API error:", err);
    res.status(500).json({error: "Internal Server Error"});
  }
});


// app.listen(3001, () => console.log('API server on port 3001'));
httpServer.listen(3001, () => console.log('Server running on 3001'));
// export const handler = serverless(app);