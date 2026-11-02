# Turn Order

## Behavior
- A *turn* is any guess a player makes, right or wrong. The server records it when the guess is accepted (`Games.lastTurn[player] = Date.now()`).
- When a round starts (`POST /games/:gameId/start`), the player whose last turn is oldest goes first. Players with no recorded turn count as oldest. Ties are broken randomly. The rest of the order is random.
- `lastTurn` is created empty at start and is **not** cleared by `/reset`, so history carries across rounds. Round 1 is fully random because nobody has a turn yet.
- Within a round: a correct guess removes the author from the order and the guesser keeps the turn; a wrong guess moves the guesser to the back.
- A guess from a name not in the current turn order is rejected with 400 and records nothing.
- Host controls mid-round:
  - The host can skip a player's turn (`POST /games/:gameId/skip-turn`), moving the current player to the back of the order and passing the turn to the next player.
  - The host can remove a player from the turn order (`DELETE /games/:gameId/players/:playerName`). If it was their turn, it passes to the next player.
- Late joiners:
  - Players who join after a round has started spectate until the next round. When the host resets for a new round (`POST /games/:gameId/reset`), late joiners submit their answer and join the turn order.

## Code
- `server/turnOrder.ts`: `buildTurnOrder(players, lastTurn)`, tested in `server/turnOrder.test.ts`.
- `server/routes.ts`: records turns in the guess route; reads `lastTurn` in the start route.
- UI copy: `HomePage.tsx` (How to play) and `StartGamePage.tsx` (Next Round footnote); iOS: `apps/ios/GameOfThings/Home/HomeView.swift` (How to Play) and `apps/ios/GameOfThings/Game/GameView.swift` (Next Round footer, How to play).
