// Randomize turn order
function shuffleArray(array: any[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Shuffle turn order, then move the player who has gone longest ago to the front.
// lastTurn maps player -> timestamp of their last guess; players who never went
// count as oldest. Exported for testing.
export function buildTurnOrder(players: string[], lastTurn: Record<string, number>) {
  const shuffled = shuffleArray([...players]);
  const lastOf = (name: string) => lastTurn[name] ?? -Infinity;
  const oldest = Math.min(...shuffled.map(lastOf));
  // shuffled is random, so the first match in it is a random pick among ties
  const firstIndex = shuffled.findIndex(name => lastOf(name) === oldest);
  if (firstIndex > 0) shuffled.unshift(...shuffled.splice(firstIndex, 1));
  return shuffled;
}
