import { ddb } from "../db";
import { GetCommand, UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { Game } from "../../types"; // Adjust path as needed

export const GameService = {
  async getGame(gameId: string) {
    const result = await ddb.send(new GetCommand({
      TableName: 'Games',
      Key: { gameId }
    }));
    return result.Item as Game | undefined;
  },

  async processGuess(gameId: string, entryId: string, guesserName: string, guessedAuthor: string) {
    // 1. Fetch the entry being guessed
    const entryResult = await ddb.send(new GetCommand({
      TableName: 'Entries',
      Key: { gameId, entryId }
    }));

    const item = entryResult.Item;
    if (!item) throw new Error("Entry not found");

    const isCorrect = item.authorName === guessedAuthor;

    if (isCorrect) {
      // --- CORRECT GUESS LOGIC ---

      // 1. Mark as guessed
      await ddb.send(new UpdateCommand({
        TableName: 'Entries',
        Key: { gameId, entryId },
        UpdateExpression: 'SET guessed = :val',
        ExpressionAttributeValues: { ':val': true }
      }));

      // 2. Increment Score
      await ddb.send(new UpdateCommand({
        TableName: 'Scores',
        Key: { gameId, playerName: guesserName },
        UpdateExpression: 'ADD score :inc',
        ExpressionAttributeValues: { ':inc': 1 }
      }));

      // 3. Remove the CAUGHT AUTHOR from turn order
      const gameData = await this.getGame(gameId);
      let turnOrder = gameData?.turnOrder || [];

      turnOrder = turnOrder.filter(name => name !== item.authorName);

      await ddb.send(new UpdateCommand({
        TableName: 'Games',
        Key: { gameId },
        UpdateExpression: 'SET turnOrder = :to',
        ExpressionAttributeValues: { ':to': turnOrder }
      }));

      return {
        isCorrect: true,
        entry: { ...item, guessed: true },
        turnOrder
      };
    } else {
      // --- WRONG GUESS LOGIC ---

      // 1. Rotate turn order (Move current player to end)
      const gameData = await this.getGame(gameId);
      let turnOrder = gameData?.turnOrder || [];

      if (turnOrder.length > 1) {
        const current = turnOrder.shift();
        if (current) turnOrder.push(current);

        await ddb.send(new UpdateCommand({
          TableName: 'Games',
          Key: { gameId },
          UpdateExpression: 'SET turnOrder = :to',
          ExpressionAttributeValues: { ':to': turnOrder }
        }));
      }

      return { isCorrect: false, turnOrder };
    }
  }
};
