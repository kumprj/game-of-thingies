// What pushes say. Pure, so it's unit tested without a database.

/**
 * What a notification says. Never an answer, an author or a guess: only whose turn it is and the
 * game code, so a locked screen can't give the game away (#71).
 */
export function turnAlert(gameId: string) {
  return {
    aps: {
      alert: {title: 'Your turn', body: `It's your turn to guess in game ${gameId}.`},
      sound: 'default',
      'thread-id': gameId,
    },
    gameId,
  };
}

export function newRoundAlert(gameId: string) {
  return {
    aps: {
      alert: {title: 'New round', body: `A new question is up in game ${gameId}. Add your answer.`},
      sound: 'default',
      'thread-id': gameId,
    },
    gameId,
  };
}

/**
 * A Live Activity update: who is up and who is left, names only. Ends the activity once nobody is
 * left to play. `contentState` must stay in step with GameActivityAttributes.ContentState on iOS.
 */
export function activityUpdate(turnOrder: string[], now = Date.now()) {
  return {
    aps: {
      timestamp: Math.floor(now / 1000),
      event: turnOrder.length > 0 ? 'update' : 'end',
      'content-state': {currentPlayer: turnOrder[0] ?? null, remaining: turnOrder},
    },
  };
}
