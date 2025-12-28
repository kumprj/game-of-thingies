import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useGameData } from '../hooks/useGameData';
import { EntryButton } from '../components/EntryButton';
import axios from 'axios';

// Assuming you have a basic WaitingRoom component (extract your logic there)
// import { WaitingRoom } from '../components/WaitingRoom';

export default function StartGamePage() {
  const { gameId } = useParams();
  const authorName = window.localStorage.getItem("got_authorName") || "";

  // Custom Hook for all data logic
  const { game, entries, scores, currentPlayer } = useGameData(gameId, authorName);

  const [shakingEntryId, setShakingEntryId] = useState<string | null>(null);

  // Derived state
  const remainingEntries = entries.filter(e => !e.guessed);
  const isLastEntry = remainingEntries.length === 1;
  const isMyTurn = currentPlayer === authorName;

  const handleEntryClick = (entry: any) => {
    // Open your guess modal here (not included in this snippet for brevity)
    // When submitting guess:
    submitGuess(entry, "GuessedName");
  };

  const submitGuess = async (entry: any, guessAuthor: string) => {
    try {
      const res = await axios.post(`/api/games/${gameId}/entries/${entry.entryId}/guess`, {
        guesserName: authorName,
        guess: guessAuthor
      });

      if (!res.data.isCorrect) {
        // Trigger Shake
        setShakingEntryId(entry.entryId);
        setTimeout(() => setShakingEntryId(null), 500);
        // Play error sound here if desired
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!game) return <div>Loading...</div>;

  // Render Waiting Room if not started
  if (!game.started) {
    return <div className="p-4">Waiting for host to start...</div>;
    // Replace with <WaitingRoom ... />
  }

  return (
      <div className="max-w-2xl mx-auto p-4 min-h-screen bg-gray-50">
        {/* Header Section */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-blue-600 mb-2">{game.question}</h1>
          <div className="bg-white p-3 rounded shadow-sm inline-block">
            <span className="text-gray-600 uppercase text-xs font-bold tracking-wider">Current Turn</span>
            <div className="text-xl font-bold text-gray-800">
              {isMyTurn ? "It's Your Turn!" : `${currentPlayer}'s Turn`}
            </div>
          </div>
        </div>

        {/* Grid of Entries */}
        <div className="space-y-4">
          {entries.map(entry => (
              <EntryButton
                  key={entry.entryId}
                  entry={entry}
                  isMyTurn={isMyTurn}
                  isMyCard={entry.authorName === authorName}
                  isLastEntry={isLastEntry}
                  isShaking={shakingEntryId === entry.entryId}
                  onClick={handleEntryClick}
              />
          ))}
        </div>

        {/* Footer / Scoreboard */}
        <div className="mt-12 border-t pt-4">
          <h3 className="font-bold text-gray-500 mb-2">Scores</h3>
          {scores.map(s => (
              <div key={s.playerName} className="flex justify-between py-1">
                <span>{s.playerName}</span>
                <span className="font-mono font-bold">{s.score}</span>
              </div>
          ))}
        </div>
      </div>
  );
}
