import express from "express";
import { v4 as uuidv4 } from "uuid";
import cors from "cors";
import serverless from 'serverless-http';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
const client = new DynamoDBClient({ region: "us-east-1" });
const ddb = DynamoDBDocumentClient.from(client);
const app = express();
app.use(express.json()); // Parses JSON bodies
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
    const { name, question } = req.body;
    const createdAt = new Date().toISOString();
    try {
        await ddb.send(new UpdateCommand({
            TableName: 'Games',
            Key: { gameId },
            UpdateExpression: 'SET #q = :q, #c = :c, gameOwner = :go',
            ExpressionAttributeNames: {
                '#q': 'question',
                '#c': 'createdAt'
            },
            ExpressionAttributeValues: {
                ':q': question || 'What is your favorite thing?',
                ':c': createdAt,
                ':go': name // Sets gameOwner on first create
            },
            ReturnValues: 'ALL_NEW'
        }));
        res.json({ gameId });
    }
    catch (error) {
        console.error('Create game failed:', error);
        res.status(500).json({ error: 'Failed to create game' });
    }
});
app.post('/api/games/:gameId/entries', async (req, res) => {
    const { gameId } = req.params;
    const { authorName, text } = req.body;
    const entryId = uuidv4();
    const createdAt = new Date().toISOString();
    const revealed = false;
    await ddb.send(new PutCommand({
        TableName: 'Entries',
        Item: { entryId, gameId, authorName, text, createdAt, revealed }
    }));
    res.json({ entryId });
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
        const entries = await ddb.send(new QueryCommand({
            TableName: 'Entries',
            KeyConditionExpression: 'gameId = :g',
            ExpressionAttributeValues: { ':g': gameId }
        }));
        for (const entry of entries.Items || []) {
            await ddb.send(new UpdateCommand({
                TableName: 'Entries',
                Key: { gameId: gameId, entryId: entry.entryId },
                UpdateExpression: 'set revealed = :r',
                ExpressionAttributeValues: { ':r': true }
            }));
        }
        res.json({ success: true });
    }
    catch (err) {
        if (err.name === 'ConditionalCheckFailedException') {
            // Game already started - force frontend refresh
            res.status(409).json({
                error: 'GAME_ALREADY_STARTED',
                message: 'Game has already started by another player!'
            });
        }
        else {
            res.status(500).json({ error: 'Failed to start game' });
        }
    }
});
app.post('/api/games/:gameId/reset', async (req, res) => {
    const { gameId } = req.params;
    const { question } = req.body;
    try {
        // 1. DELETE ALL existing entries for this game
        const entriesData = await ddb.send(new QueryCommand({
            TableName: 'Entries',
            KeyConditionExpression: 'gameId = :g',
            ExpressionAttributeValues: { ':g': gameId }
        }));
        const deletePromises = (entriesData.Items || []).map(entry => ddb.send(new DeleteCommand({
            TableName: 'Entries',
            Key: { gameId: entry.gameId, entryId: entry.entryId }
        })));
        await Promise.all(deletePromises);
        console.log(`Deleted ${deletePromises.length} old entries`);
        await ddb.send(new UpdateCommand({
            TableName: 'Games',
            Key: { gameId },
            UpdateExpression: 'SET question = :q, createdAt = :c, gameOwner = gameOwner, started = :started',
            ExpressionAttributeValues: {
                ':q': question?.trim() || 'What is your favorite thing?',
                ':c': new Date().toISOString(),
                ':started': false
            },
            ReturnValues: 'ALL_NEW'
        }));
        res.json({ success: true, message: 'Game reset with fresh slate' });
    }
    catch (error) {
        console.error('Reset error:', error);
        res.status(500).json({ error: 'Failed to reset game' });
    }
});
app.get('/api/games/:gameId', async (req, res) => {
    console.log("got here");
    console.log('req.params:', req.params);
    const { gameId } = req.params;
    console.log('Fetching game for gameId:', gameId);
    try {
        const result = await ddb.send(new GetCommand({
            TableName: 'Games',
            Key: { gameId }
        }));
        console.log("Result is ", result);
        if (!result.Item)
            return res.status(404).json({ error: 'Game not found' });
        res.json(result.Item);
    }
    catch (error) {
        console.error('Error fetching game:', error);
        console.log("gameId is", gameId);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
app.get('/api/games/:gameId/entries', async (req, res) => {
    const { gameId } = req.params;
    const result = await ddb.send(new QueryCommand({
        TableName: 'Entries',
        KeyConditionExpression: 'gameId = :g',
        ExpressionAttributeValues: { ':g': gameId }
    }));
    console.log("Query items:", result.Items);
    res.json(result.Items ?? []); // ⬅️ send array only
});
app.get('/api/games/:gameId/scores', async (req, res) => {
    const { gameId } = req.params;
    try {
        const result = await ddb.send(new QueryCommand({
            TableName: 'Scores',
            KeyConditionExpression: 'gameId = :g',
            ExpressionAttributeValues: { ':g': gameId },
        }));
        // Return array of { playerName, score }
        const items = (result.Items || []).map(item => ({
            playerName: item.playerName,
            score: item.score ?? 0,
        }));
        res.json(items);
    }
    catch (err) {
        console.error('Scores fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch scores' });
    }
});
app.post('/api/games/:gameId/entries/:entryId/guess', async (req, res) => {
    const { gameId, entryId } = req.params;
    const { guesserName, guess } = req.body;
    try {
        // Get the entry
        const entryResult = await ddb.send(new GetCommand({
            TableName: 'Entries',
            Key: { gameId, entryId },
        }));
        const item = entryResult.Item;
        if (!item) {
            return res.status(404).json({ error: "Entry not found" });
        }
        const isCorrect = item.authorName === guess;
        if (isCorrect) {
            // Mark as guessed
            await ddb.send(new UpdateCommand({
                TableName: 'Entries',
                Key: { gameId, entryId },
                UpdateExpression: 'SET guessed = :val',
                ExpressionAttributeValues: { ':val': true },
            }));
            // Increment player score in Scores table
            await ddb.send(new UpdateCommand({
                TableName: 'Scores',
                Key: { gameId, playerName: guesserName },
                UpdateExpression: 'ADD score :inc',
                ExpressionAttributeValues: { ':inc': 1 },
            }));
            // Fetch the updated entry
            const updatedEntryResult = await ddb.send(new GetCommand({
                TableName: 'Entries',
                Key: { gameId, entryId },
            }));
            return res.json({
                isCorrect,
                entry: updatedEntryResult.Item,
            });
        }
        // Wrong answer branch – still respond
        return res.json({ isCorrect });
    }
    catch (err) {
        console.error("Guess API error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});
// app.listen(3001, () => console.log('API server on port 3001'));
export const handler = serverless(app);
