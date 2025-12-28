import { useState, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { Game, Entry, Score } from '../../../../types'; // Adjust path

// Initialize socket outside component to avoid reconnect loops
const socket = io(process.env.NODE_ENV === 'production'
    ? 'https://game-of-thingies.onrender.com'
    : 'http://localhost:3001');

export const useGameData = (gameId: string | undefined, authorName: string) => {
  const [game, setGame] = useState<Game | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<string | null>(null);

  // Fetch initial data
  useEffect(() => {
    if (!gameId) return;

    const fetchData = async () => {
      try {
        const [gRes, eRes, sRes] = await Promise.all([
          axios.get(`/api/games/${gameId}`),
          axios.get(`/api/games/${gameId}/entries`),
          axios.get(`/api/games/${gameId}/scores`)
        ]);

        setGame(gRes.data);
        setEntries(eRes.data);
        setScores(sRes.data);

        if (gRes.data.turnOrder && gRes.data.turnOrder.length > 0) {
          setCurrentPlayer(gRes.data.turnOrder[0]);
        }
      } catch (err) {
        console.error("Error fetching game data", err);
      }
    };
    fetchData();
  }, [gameId]);

  // Socket Listeners
  useEffect(() => {
    if (!gameId) return;

    socket.emit("joinGame", gameId);

    const handleNextTurn = ({ currentPlayer: next, turnOrder }: any) => {
      setCurrentPlayer(next);
      setGame(prev => prev ? { ...prev, turnOrder } : null);
    };

    const handleEntriesUpdated = () => {
      // Refresh entries when someone adds one or it's guessed
      axios.get(`/api/games/${gameId}/entries`).then(res => setEntries(res.data));
    };

    const handleGameStarted = ({ turnOrder }: any) => {
      setGame(prev => prev ? { ...prev, started: true, turnOrder } : null);
      setCurrentPlayer(turnOrder[0]);
      handleEntriesUpdated(); // Reveal entries
    };

    socket.on("nextTurn", handleNextTurn);
    socket.on("gameStarted", handleGameStarted);
    socket.on("entriesUpdated", handleEntriesUpdated);

    // Cleanup
    return () => {
      socket.off("nextTurn");
      socket.off("gameStarted");
      socket.off("entriesUpdated");
    };
  }, [gameId]);

  return { game, entries, scores, currentPlayer, socket };
};
