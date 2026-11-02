import {useEffect, useMemo, useRef, useState} from "react";
import {useParams} from "react-router-dom";
import confetti from "canvas-confetti";
import axios, {socket} from "../gameConfig";
import {Entry, Score} from "../../../types";
import {getHostToken} from "../hostToken";
import {getPlayerToken} from "../playerToken";
import {saveRecentGame, removeRecentGame} from "../recentGames";

/**
 * Custom hook to manage game logic and state.
 * Provides all necessary state, actions, and computed values for the game.
 */
export function useGameLogic() {
  const {gameId} = useParams(); // Extracts the game ID from the URL parameters.

  // --- State ---
  const [gameTitle, setGameTitle] = useState<string | null>(null); // Stores the game owner's name.
  const [gameQuestion, setGameQuestion] = useState<string | null>(null); // Stores the current game question.
  const [entries, setEntries] = useState<Entry[]>([]); // Stores the list of game entries.
  const [scores, setScores] = useState<Score[]>([]); // Stores the list of player scores.
  const [turnOrder, setTurnOrder] = useState<string[]>([]); // Stores the order of players' turns.
  const [currentPlayer, setCurrentPlayer] = useState<string | null>(null); // Stores the current player's name.
  const [started, setStarted] = useState(false); // Indicates whether the game has started.
  const [gameNotFound, setGameNotFound] = useState(false); // The server has no game with this code.

  // User Input State
  const [entryText, setEntryText] = useState(""); // Stores the text of the user's entry.
  const [authorName, setAuthorName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("got_authorName") ?? ""; // Retrieves the author's name from local storage.
  });
  const [newQuestion, setNewQuestion] = useState(""); // Stores the new question for the next round.
  const [resetCount, setResetCount] = useState(0);
  // Loading/UI State
  const [isLoading, setIsLoading] = useState(false); // Indicates whether a general loading state is active.
  const [addEntryLoading, setAddEntryLoading] = useState(false); // Indicates whether the "add entry" action is loading.
  const [startNewRoundLoading, setStartNewRoundLoading] = useState(false); // Indicates whether the "start new round" action is loading.
  const [guessLoading, setGuessLoading] = useState(false); // Indicates whether the "guess author" action is loading.
  const [guessingEntry, setGuessingEntry] = useState<Entry | null>(null); // Stores the entry currently being guessed.
  const [isConnected, setIsConnected] = useState(true);
  const [showStartConfirm, setShowStartConfirm] = useState(false); // Indicates whether the start confirmation modal is visible.
  const [showHowToPlay, setShowHowToPlay] = useState(false); // Indicates whether the "how to play" modal is visible.
  const [showScores, setShowScores] = useState<boolean>(false); // Indicates whether the scores modal is visible.

  const addEntryInFlight = useRef(false); // Synchronous guard: state updates land too late to stop a double-tap.
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({}); // Stores references to entry buttons.
  const roundStartScoresRef = useRef<Record<string, number>>({});
  const prevAllGuessedRef = useRef(false);
  const scoresRef = useRef(scores);
  scoresRef.current = scores;

  type ToastData = {
    message: string;
    type: 'success' | 'error';
    duration?: number;
  };
  const [toast, setRawToast] = useState<ToastData | null>(null);
  const toastQueueRef = useRef<ToastData[]>([]);

  const setToast = (t: ToastData | null) => {
    if (!t) {
      if (toastQueueRef.current.length > 0) {
        const next = toastQueueRef.current.shift()!;
        setRawToast(next);
      } else {
        setRawToast(null);
      }
      return;
    }
    if (!toast) {
      setRawToast(t);
    } else {
      toastQueueRef.current.push(t);
    }
  };

  // --- Helpers ---
  /**
   * Triggers a confetti animation.
   */
  const triggerConfetti = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: {y: 0.6},
      colors: ['#26ccff', '#a25afd', '#ff5e7e', '#88ff5a', '#fcff42', '#ffa62d', '#ff36ff']
    });
  };

  // --- Effects ---

  /**
   * Clears the toast notification or shows the next queued toast automatically after its duration.
   */
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      if (toastQueueRef.current.length > 0) {
        const next = toastQueueRef.current.shift()!;
        setRawToast(next);
      } else {
        setRawToast(null);
      }
    }, toast.duration || 5000);
    return () => clearTimeout(timer);
  }, [toast?.message, toast?.duration]);

  /**
   * Persists the author's name in local storage.
   */
  useEffect(() => {
    if (authorName.trim() === "") return;
    window.localStorage.setItem("got_authorName", authorName);
  }, [authorName]);

  /**
   * Fetches game data, entries, and scores, and sets up socket event listeners.
   */
  useEffect(() => {
    if (!gameId) return;

    setGameNotFound(false);
    let notFound = false;
    let pollInterval: NodeJS.Timeout | null = null;

    const fetchGameData = async () => {
      try {
        const res = await axios.get(`/api/games/${gameId}`);
        const title = res.data.title || res.data.gameOwner || null;
        setGameQuestion(res.data.question || null);
        setGameTitle(title);
        setStarted(res.data.started === true);
        if (res.data.turnOrder) {
          setTurnOrder(res.data.turnOrder);
          setCurrentPlayer(res.data.turnOrder[0] || null);
        }
        saveRecentGame(gameId, title);
      } catch (err) {
        if ((err as any)?.response?.status === 404) {
          // A missing game won't appear by retrying, so stop polling for it.
          notFound = true;
          setGameNotFound(true);
          setToast(null);
          removeRecentGame(gameId);
          if (pollInterval) clearInterval(pollInterval);
          pollInterval = null;
          return;
        }
        console.error("Failed to fetch game data", err);
      }
    };

    const syncAllData = () => {
      if (notFound) return;
      fetchGameData();
      fetchEntries();
      fetchScores();
    };

    syncAllData();

    socket.emit("joinGame", gameId);
    const startPolling = () => {
      if (notFound) return;
      console.log("⚠️ Disconnected! Refreshing...");
      setIsConnected(false);
      setToast({message: "Reconnecting...", type: "error", duration: 99999}); // Persistent toast

      // Poll every 3 seconds while disconnected
      pollInterval = setInterval(() => {
        if (document.visibilityState === 'visible') {
          syncAllData();
        }
      }, 3000);
    };

    const stopPolling = () => {
      console.log("✅ Connected! Stopping refreshing.");
      setIsConnected(true);
      setToast({message: "Connected!", type: "success", duration: 2000});

      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      // Sync one last time to make sure we didn't miss anything during the transition
      syncAllData();
    };

    const onEntriesUpdated = () => fetchEntries();

    const onGameStarted = (data: any) => {
      setTurnOrder(data.turnOrder || []);
      setCurrentPlayer(data.turnOrder?.[0] || null);
      syncAllData();
      const map: Record<string, number> = {};
      scoresRef.current.forEach(s => { map[s.playerName] = s.score; });
      roundStartScoresRef.current = map;
      setToast({message: "‼️ The game has started ‼️", type: 'success'});
    };

    const onWrongAnswer = (data: { playerName: string; guess: string }) => {
      console.log("❌ Wrong Answer Socket Data:", data);
      setToast({
        message: `❌ ${data.playerName} guessed wrong for '${data.guess}'!`,
        type: 'error',
        duration: 3000
      });
      fetchEntries();
    };

    const onGameReset = () => {
      syncAllData();
      roundStartScoresRef.current = {};
      setResetCount(prev => prev + 1); // <--- Add this
      setToast({message: "‼️ A new question has been asked – add your answer", type: 'success'});
    };

    const onScoreUpdated = (data: any) => {
      fetchScores();
      triggerConfetti();
      setToast({
        message: `🎉 ${data?.playerName || 'Someone'} got it right! The answer was '${data?.guess}', written by ${data?.authorName}`,
        type: 'success',
        duration: 7000
      });
    };

    const onNextTurn = (data: any) => {
      setTurnOrder(data.turnOrder);
      setCurrentPlayer(data.currentPlayer);
    };

    const onPlayerRemoved = (data: any) => {
      if (data?.turnOrder) {
        setTurnOrder(data.turnOrder);
        setCurrentPlayer(data.turnOrder[0] || null);
      }
    };

    socket.on("entriesUpdated", onEntriesUpdated);
    socket.on("gameStarted", onGameStarted);
    socket.on("wrongAnswer", onWrongAnswer);
    socket.on("gameReset", onGameReset);
    socket.on("scoreUpdated", onScoreUpdated);
    socket.on("nextTurn", onNextTurn);
    socket.on("playerRemoved", onPlayerRemoved);
    // Attach Connection Listeners
    socket.on("connect", stopPolling);
    socket.on("disconnect", startPolling);

    return () => {
      // Pass each handler: off(event) alone would also remove other components' listeners.
      socket.off("entriesUpdated", onEntriesUpdated);
      socket.off("gameStarted", onGameStarted);
      socket.off("wrongAnswer", onWrongAnswer);
      socket.off("gameReset", onGameReset);
      socket.off("scoreUpdated", onScoreUpdated);
      socket.off("nextTurn", onNextTurn);
      socket.off("playerRemoved", onPlayerRemoved);
      socket.off("connect", stopPolling);
      socket.off("disconnect", startPolling);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [gameId]);

  // --- Actions ---

  /**
   * Fetches the scores for the current game.
   */
  const fetchScores = async () => {
    if (!gameId) return;
    try {
      const res = await axios.get<Score[]>(`/api/games/${gameId}/scores`);
      const sorted = [...res.data].sort((a, b) => b.score - a.score);
      setScores(sorted);
      if (started && Object.keys(roundStartScoresRef.current).length === 0) {
        const map: Record<string, number> = {};
        sorted.forEach(s => { map[s.playerName] = s.score; });
        roundStartScoresRef.current = map;
      }
    } catch (err) {
      console.error("Error fetching scores", err);
    }
  };

  /**
   * Fetches the entries for the current game.
   */
  const fetchEntries = async () => {
    if (!gameId) return;
    try {
      const res = await axios.get(`/api/games/${gameId}/entries`);
      setEntries(res.data ?? []);
    } catch (err) {
      console.error("Error fetching entries", err);
    }
  };

  /**
   * Adds a new entry to the game.
   */
  const addEntry = async () => {
    if (addEntryInFlight.current || started || !entryText.trim() || !authorName.trim()) return;
    addEntryInFlight.current = true;
    setAddEntryLoading(true);
    try {
      await axios.post(`/api/games/${gameId}/entries`, {authorName: authorName.trim(), text: entryText.trim()});
      setEntryText("");
      await fetchEntries();
      setToast({message: "Entry added!", type: "success"});
    } catch (error) {
      const serverMessage = (error as any)?.response?.data?.error;
      setToast({message: serverMessage || "Failed to add entry", type: "error"});
    } finally {
      addEntryInFlight.current = false;
      setAddEntryLoading(false);
    }
  };

  /**
   * Starts the game.
   */
  const hostToken = getHostToken(gameId);
  const isHost = hostToken !== null;
  const hostHeaders = {headers: {"x-host-token": hostToken ?? ""}};

  const startGame = async () => {
    if (!entries.length) {
      setToast({message: 'Add some entries first!', type: 'error'});
      return;
    }
    setIsLoading(true);
    try {
      await axios.post(`/api/games/${gameId}/start`, undefined, hostHeaders);
      setStarted(true);
      const map: Record<string, number> = {};
      scoresRef.current.forEach(s => { map[s.playerName] = s.score; });
      roundStartScoresRef.current = map;
      await fetchEntries();
      await fetchScores();
    } catch (error: any) {
      if (error.response?.status === 409) {
        setToast({message: 'Game already started! Refreshing...', type: 'success'});
        setTimeout(() => window.location.reload(), 1500);
        return;
      }
      setToast({message: error.response?.data?.error || 'Failed to start game', type: 'error'});
    } finally {
      setIsLoading(false);
      setShowStartConfirm(false);
    }
  };

  /**
   * Starts a new round with a new question.
   */
  const startNewRound = async () => {
    setStartNewRoundLoading(true);
    try {
      await axios.post(`/api/games/${gameId}/reset`, {question: newQuestion.trim()}, hostHeaders);
      setNewQuestion("");
      setEntries([]);
      setStarted(false);
      roundStartScoresRef.current = {};
    } catch (err) {
      console.error("Reset failed", err);
    } finally {
      setStartNewRoundLoading(false);
    }
  };

  /**
   * Submits a guess for the author of an entry.
   * @param entryId - The ID of the entry being guessed.
   * @param guess - The name of the guessed author.
   */
  const guessAuthor = async (entryId: string, guess: string) => {
    setGuessLoading(true);
    try {
      const response = await axios.post(`/api/games/${gameId}/entries/${entryId}/guess`, {
        guesserName: authorName, guess
      });
      if (response.data.isCorrect === true) {
        setToast({message: "Correct!", type: "success"});
        fetchEntries();
        await fetchScores();

      } else {
        setToast({message: "Wrong answer!", type: "error", duration: 7000});
      }
    } catch (err) {
      console.error("Error submitting guess", err);
      const serverMessage = (err as any)?.response?.data?.error;
      setToast({message: serverMessage || "Error submitting guess", type: "error"});
      if ((err as any)?.response?.status === 409) fetchEntries();
    } finally {
      setGuessLoading(false);
      setGuessingEntry(null);
    }
  };

  /**
   * Edits an entry before game start.
   */
  const editEntry = async (entryId: string, text: string) => {
    try {
      await axios.patch(`/api/games/${gameId}/entries/${entryId}`, {text: text.trim()}, {
        headers: {'x-player-token': getPlayerToken()}
      });
      await fetchEntries();
      setToast({message: "Answer updated!", type: "success"});
      return true;
    } catch (err: any) {
      const serverMessage = err.response?.data?.error;
      setToast({message: serverMessage || "Failed to update answer", type: "error"});
      return false;
    }
  };

  /**
   * Withdraws/removes an entry before game start.
   */
  const deleteEntry = async (entryId: string) => {
    try {
      await axios.delete(`/api/games/${gameId}/entries/${entryId}`, {
        headers: {'x-player-token': getPlayerToken()}
      });
      await fetchEntries();
      setToast({message: "Answer removed!", type: "success"});
      return true;
    } catch (err: any) {
      const serverMessage = err.response?.data?.error;
      setToast({message: serverMessage || "Failed to remove answer", type: "error"});
      return false;
    }
  };

  /**
   * Skips the current player's turn (Host only).
   */
  const skipTurn = async () => {
    try {
      const res = await axios.post(`/api/games/${gameId}/skip-turn`, undefined, hostHeaders);
      if (res.data?.turnOrder) {
        setTurnOrder(res.data.turnOrder);
        setCurrentPlayer(res.data.turnOrder[0] || null);
      }
      setToast({message: "Turn skipped", type: "success"});
    } catch (err: any) {
      const serverMessage = err.response?.data?.error;
      setToast({message: serverMessage || "Failed to skip turn", type: "error"});
    }
  };

  /**
   * Removes a player from the turn order (Host only).
   */
  const removePlayer = async (playerName: string) => {
    try {
      const res = await axios.delete(`/api/games/${gameId}/players/${encodeURIComponent(playerName)}`, hostHeaders);
      if (res.data?.turnOrder) {
        setTurnOrder(res.data.turnOrder);
        setCurrentPlayer(res.data.turnOrder[0] || null);
      }
      setToast({message: `Removed ${playerName}`, type: "success"});
    } catch (err: any) {
      const serverMessage = err.response?.data?.error;
      setToast({message: serverMessage || "Failed to remove player", type: "error"});
    }
  };

  // --- Computed ---
  /**
   * Computes the sorted entries for display based on the game state.
   */
  const sortedEntriesForDisplay = useMemo(() => {
    let sorted = [...entries];
    if (started) {
      sorted.sort((a, b) => a.text.localeCompare(b.text, undefined, {sensitivity: "base"}));
    } else {
      sorted.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
    }
    return sorted;
  }, [entries, started]);

  const guessedNames = Array.from(new Set(entries.filter(e => e.guessed).map(e => e.authorName))).sort();
  const notGuessedNames = Array.from(new Set(entries.filter(e => !e.guessed).map(e => e.authorName))).sort();
  const allGuessed = entries.length > 0 && entries.every(entry => entry.guessed);
  const remainingEntries = entries.filter(e => !e.guessed);
  const isLastEntry = remainingEntries.length === 1;
  const isMyTurn = currentPlayer === authorName;
  const uniqueNames = Array.from(new Set(entries.map(e => e.authorName)));

  // Auto-open scoreboard when round completes
  useEffect(() => {
    if (allGuessed && !prevAllGuessedRef.current) {
      setShowScores(true);
    }
    prevAllGuessedRef.current = allGuessed;
  }, [allGuessed]);

  const roundRecap = useMemo(() => {
    if (!allGuessed || scores.length === 0) return null;
    const gainedList = scores.map(s => {
      const start = roundStartScoresRef.current[s.playerName] ?? 0;
      return { playerName: s.playerName, gained: Math.max(0, s.score - start) };
    });
    const maxGained = Math.max(...gainedList.map(g => g.gained), 0);
    const topGuessers = gainedList.filter(g => g.gained === maxGained && g.gained > 0);
    const topScore = Math.max(...scores.map(s => s.score));
    const leaders = scores.filter(s => s.score === topScore);

    return {
      mostGuessesRound: topGuessers.length > 0
        ? topGuessers.map(g => `${g.playerName} (${g.gained})`).join(', ')
        : 'None',
      overallLeader: leaders.map(l => `${l.playerName} (${l.score})`).join(', ')
    };
  }, [allGuessed, scores]);

  return {
    gameId,
    gameTitle,
    gameQuestion,
    entries,
    scores,
    turnOrder,
    currentPlayer,
    started,
    gameNotFound,
    isHost,
    entryText,
    setEntryText,
    authorName,
    setAuthorName,
    newQuestion,
    setNewQuestion,
    isLoading,
    addEntryLoading,
    startNewRoundLoading,
    guessLoading,
    guessingEntry,
    setGuessingEntry,
    showStartConfirm,
    setShowStartConfirm,
    showHowToPlay,
    setShowHowToPlay,
    showScores,
    setShowScores,
    buttonRefs,
    toast,
    setToast,
    addEntry,
    editEntry,
    deleteEntry,
    skipTurn,
    removePlayer,
    startGame,
    startNewRound,
    guessAuthor,
    onEntryClick: setGuessingEntry,
    sortedEntriesForDisplay,
    guessedNames,
    notGuessedNames,
    allGuessed,
    isLastEntry,
    isMyTurn,
    resetCount,
    uniqueNames,
    roundRecap
  };
}