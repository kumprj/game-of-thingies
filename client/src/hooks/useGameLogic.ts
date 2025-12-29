import {useEffect, useMemo, useRef, useState} from "react";
import {useParams} from "react-router-dom";
import confetti from "canvas-confetti";
import axios, {socket} from "../gameConfig";
import {Entry, Score} from "../../../types";

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

  // User Input State
  const [entryText, setEntryText] = useState(""); // Stores the text of the user's entry.
  const [authorName, setAuthorName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("got_authorName") ?? ""; // Retrieves the author's name from local storage.
  });
  const [newQuestion, setNewQuestion] = useState(""); // Stores the new question for the next round.

  // Loading/UI State
  const [isLoading, setIsLoading] = useState(false); // Indicates whether a general loading state is active.
  const [addEntryLoading, setAddEntryLoading] = useState(false); // Indicates whether the "add entry" action is loading.
  const [startNewRoundLoading, setStartNewRoundLoading] = useState(false); // Indicates whether the "start new round" action is loading.
  const [guessLoading, setGuessLoading] = useState(false); // Indicates whether the "guess author" action is loading.
  const [guessingEntry, setGuessingEntry] = useState<Entry | null>(null); // Stores the entry currently being guessed.
  const [guessedEntryIds, setGuessedEntryIds] = useState<Set<string>>(new Set()); // Stores the IDs of guessed entries.
  const [isConnected, setIsConnected] = useState(true);
  const [showStartConfirm, setShowStartConfirm] = useState(false); // Indicates whether the start confirmation modal is visible.
  const [showHowToPlay, setShowHowToPlay] = useState(false); // Indicates whether the "how to play" modal is visible.
  const [showScores, setShowScores] = useState<boolean>(false); // Indicates whether the scores modal is visible.

  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({}); // Stores references to entry buttons.

  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
    duration?: number;
  } | null>(null); // Stores the toast notification state.

  // --- Helpers ---
  /**
   * Sleeps for the specified number of milliseconds.
   * @param ms - The number of milliseconds to sleep.
   */
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
   * Clears the toast notification automatically after its duration.
   */
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.duration || 5000);
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

    const fetchGameData = async () => {
      try {
        const res = await axios.get(`/api/games/${gameId}`);
        setGameQuestion(res.data.question || null);
        setGameTitle(res.data.gameOwner || null);
        if (res.data.turnOrder) {
          setTurnOrder(res.data.turnOrder);
          setCurrentPlayer(res.data.turnOrder[0] || null);
        }
      } catch (err) {
        console.error("Failed to fetch game data", err);
      }
    };

    const syncAllData = () => {
      fetchGameData();
      fetchEntries();
      fetchScores();
    };

    syncAllData();

    socket.emit("joinGame", gameId);
    let pollInterval: NodeJS.Timeout | null = null;
    const startPolling = () => {
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

    socket.on("entriesUpdated", onEntriesUpdated);
    socket.on("gameStarted", onGameStarted);
    socket.on("wrongAnswer", onWrongAnswer);
    socket.on("gameReset", onGameReset);
    socket.on("scoreUpdated", onScoreUpdated);
    socket.on("nextTurn", onNextTurn);
    // Attach Connection Listeners
    socket.on("connect", stopPolling);
    socket.on("disconnect", startPolling);


    return () => {
      socket.off("entriesUpdated");
      socket.off("gameStarted");
      socket.off("wrongAnswer");
      socket.off("gameReset");
      socket.off("scoreUpdated");
      socket.off("nextTurn");
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
      setScores([...res.data].sort((a, b) => b.score - a.score));
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
      const sortedEntries = (res.data ?? []).slice().sort(
          (a: Entry, b: Entry) => a.text.localeCompare(b.text, undefined, {sensitivity: "base"})
      );
      setEntries(sortedEntries);
      setStarted(sortedEntries.some((e: Entry) => e.revealed));
    } catch (err) {
      console.error("Error fetching entries", err);
    }
  };

  /**
   * Adds a new entry to the game.
   */
  const addEntry = async () => {
    if (started || !entryText || !authorName) return;
    setAddEntryLoading(true);
    const startTime = Date.now();
    try {
      await axios.post(`/api/games/${gameId}/entries`, {authorName, text: entryText});
      setEntryText("");
      await fetchEntries();
      const elapsed = Date.now() - startTime;
      if (1000 - elapsed > 0) await sleep(1000 - elapsed);
      setToast({message: "Entry added!", type: "success"});
    } catch (error) {
      setToast({message: "Failed to add entry", type: "error"});
    } finally {
      setAddEntryLoading(false);
    }
  };

  /**
   * Starts the game.
   */
  const startGame = async () => {
    if (!entries.length) {
      setToast({message: 'Add some entries first!', type: 'error'});
      return;
    }
    setIsLoading(true);
    try {
      await axios.post(`/api/games/${gameId}/start`);
      setStarted(true);
      await fetchEntries();
      await fetchScores();
    } catch (error: any) {
      if (error.response?.status === 409) {
        setToast({message: 'Game already started! Refreshing...', type: 'success'});
        setTimeout(() => window.location.reload(), 1500);
        return;
      }
      setToast({message: 'Failed to start game', type: 'error'});
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
      await axios.post(`/api/games/${gameId}/reset`, {question: newQuestion.trim()});
      setNewQuestion("");
      setEntries([]);
      setGuessedEntryIds(new Set());
      setStarted(false);
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
    await sleep(1500);

    try {
      const response = await axios.post(`/api/games/${gameId}/entries/${entryId}/guess`, {
        guesserName: authorName, guess
      });
      const data = response.data;

      const isSuccess = data.isCorrect === true || data.success === true;

      if (isSuccess) {
        setToast({message: "Correct!", type: "success"});

        if (data.entry) {
          setEntries(prev => prev.map(e => e.entryId === data.entry.entryId ? data.entry : e));
        } else {
          fetchEntries();
        }

        setGuessedEntryIds(prev => new Set(prev).add(entryId));
        await fetchScores();

      } else {
        setToast({message: "Wrong answer!", type: "error", duration: 7000});
      }
    } catch (err) {
      console.error("Error submitting guess", err);
      setToast({message: "Error submitting guess", type: "error"});
    } finally {
      setGuessLoading(false);
      setGuessingEntry(null);
    }
  };

  // --- Computed ---
  /**
   * Computes the sorted entries for display based on the game state.
   */
  const sortedEntriesForDisplay = useMemo(() => {
    let sorted = [...entries];
    if (started) {
      sorted.sort((a, b) => a.text.localeCompare(b.text));
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

  return {
    gameId,
    gameTitle,
    gameQuestion,
    entries,
    scores,
    turnOrder,
    currentPlayer,
    started,
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
    guessedEntryIds,
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
    uniqueNames
  };
}