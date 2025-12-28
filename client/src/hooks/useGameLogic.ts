import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import confetti from "canvas-confetti";
import axios, { socket } from "../gameConfig";
import { Entry, Score } from "../../../types";

export function useGameLogic() {
  const { gameId } = useParams();

  // --- State ---
  const [gameTitle, setGameTitle] = useState<string | null>(null);
  const [gameQuestion, setGameQuestion] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [turnOrder, setTurnOrder] = useState<string[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  // User Input State
  const [entryText, setEntryText] = useState("");
  const [authorName, setAuthorName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("got_authorName") ?? "";
  });
  const [newQuestion, setNewQuestion] = useState("");

  // Loading/UI State
  const [isLoading, setIsLoading] = useState(false);
  const [addEntryLoading, setAddEntryLoading] = useState(false);
  const [startNewRoundLoading, setStartNewRoundLoading] = useState(false);
  const [guessLoading, setGuessLoading] = useState(false);
  const [guessingEntry, setGuessingEntry] = useState<Entry | null>(null);
  const [guessedEntryIds, setGuessedEntryIds] = useState<Set<string>>(new Set());

  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showScores, setShowScores] = useState<boolean>(false);

  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
    duration?: number;
  } | null>(null);

  // --- Helpers ---
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const triggerConfetti = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#26ccff', '#a25afd', '#ff5e7e', '#88ff5a', '#fcff42', '#ffa62d', '#ff36ff']
    });
  };

  // --- Effects ---

  // Clear toast automatically
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.duration || 5000);
    return () => clearTimeout(timer);
  }, [toast?.message, toast?.duration]);

  // Persist name
  useEffect(() => {
    if (authorName.trim() === "") return;
    window.localStorage.setItem("got_authorName", authorName);
  }, [authorName]);

  // --- Game Data & Sockets ---
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

    fetchGameData();
    fetchEntries();
    fetchScores();

    socket.emit("joinGame", gameId);

    const onEntriesUpdated = () => fetchEntries();

    const onGameStarted = (data: any) => {
      setTurnOrder(data.turnOrder || []);
      setCurrentPlayer(data.turnOrder?.[0] || null);
      fetchGameData();
      fetchEntries();
      setToast({ message: "‼️ The game has started ‼️", type: 'success' });
    };

    // ✅ FIXED: Matches your backend emit exactly
    const onWrongAnswer = (data: { playerName: string; guess: string }) => {
      console.log("❌ Wrong Answer Socket Data:", data);

      // Since data.guess is 'item.text', this toast reads:
      // "Alice guessed wrong for 'I love pizza'!"
      setToast({
        message: `❌ ${data.playerName} guessed wrong for '${data.guess}'!`,
        type: 'error',
        duration: 5000
      });

      // Refresh entries in case turns changed
      fetchEntries();
    };

    const onGameReset = () => {
      fetchGameData();
      fetchEntries();
      fetchScores();
      setToast({ message: "‼️ A new question has been asked – add your answer", type: 'success' });
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

    return () => {
      socket.off("entriesUpdated");
      socket.off("gameStarted");
      socket.off("wrongAnswer");
      socket.off("gameReset");
      socket.off("scoreUpdated");
      socket.off("nextTurn");
    };
  }, [gameId]);

  // --- Actions ---

  const fetchScores = async () => {
    if (!gameId) return;
    try {
      const res = await axios.get<Score[]>(`/api/games/${gameId}/scores`);
      setScores([...res.data].sort((a, b) => b.score - a.score));
    } catch (err) { console.error("Error fetching scores", err); }
  };

  const fetchEntries = async () => {
    if (!gameId) return;
    try {
      const res = await axios.get(`/api/games/${gameId}/entries`);
      const sortedEntries = (res.data ?? []).slice().sort(
          (a: Entry, b: Entry) => a.text.localeCompare(b.text, undefined, { sensitivity: "base" })
      );
      setEntries(sortedEntries);
      setStarted(sortedEntries.some((e: Entry) => e.revealed));
    } catch (err) { console.error("Error fetching entries", err); }
  };

  const addEntry = async () => {
    if (started || !entryText || !authorName) return;
    setAddEntryLoading(true);
    const startTime = Date.now();
    try {
      await axios.post(`/api/games/${gameId}/entries`, { authorName, text: entryText });
      setEntryText("");
      await fetchEntries();
      const elapsed = Date.now() - startTime;
      if (1000 - elapsed > 0) await sleep(1000 - elapsed);
      setToast({ message: "Entry added!", type: "success" });
    } catch (error) {
      setToast({ message: "Failed to add entry", type: "error" });
    } finally {
      setAddEntryLoading(false);
    }
  };

  const startGame = async () => {
    if (!entries.length) {
      setToast({ message: 'Add some entries first!', type: 'error' });
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
        setToast({ message: 'Game already started! Refreshing...', type: 'success' });
        setTimeout(() => window.location.reload(), 1500);
        return;
      }
      setToast({ message: 'Failed to start game', type: 'error' });
    } finally {
      setIsLoading(false);
      setShowStartConfirm(false);
    }
  };

  const startNewRound = async () => {
    setStartNewRoundLoading(true);
    try {
      await axios.post(`/api/games/${gameId}/reset`, { question: newQuestion.trim() });
      setNewQuestion("");
      setEntries([]);
      setGuessedEntryIds(new Set());
      setStarted(false);
    } catch (err) { console.error("Reset failed", err); }
    finally { setStartNewRoundLoading(false); }
  };

  const guessAuthor = async (entryId: string, guess: string) => {
    setGuessLoading(true);
    await sleep(1500);

    try {
      const response = await axios.post(`/api/games/${gameId}/entries/${entryId}/guess`, {
        guesserName: authorName, guess
      });
      const data = response.data;

      // Check for success (permissive check in case backend varies slightly)
      const isSuccess = data.isCorrect === true || data.success === true;

      if (isSuccess) {
        setToast({ message: "Correct!", type: "success" });

        // Optimistic update if entry data returned
        if (data.entry) {
          setEntries(prev => prev.map(e => e.entryId === data.entry.entryId ? data.entry : e));
        } else {
          fetchEntries();
        }

        setGuessedEntryIds(prev => new Set(prev).add(entryId));
        await fetchScores();

      } else {
        setToast({ message: "Wrong answer!", type: "error", duration: 7000 });
      }
    } catch (err) {
      console.error("Error submitting guess", err);
      setToast({ message: "Error submitting guess", type: "error" });
    } finally {
      setGuessLoading(false);
      setGuessingEntry(null);
    }
  };

  // --- Computed ---
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
    gameId, gameTitle, gameQuestion, entries, scores, turnOrder, currentPlayer, started,
    entryText, setEntryText, authorName, setAuthorName, newQuestion, setNewQuestion,
    isLoading, addEntryLoading, startNewRoundLoading, guessLoading,
    guessingEntry, setGuessingEntry, guessedEntryIds,
    showStartConfirm, setShowStartConfirm, showHowToPlay, setShowHowToPlay, showScores, setShowScores,
    buttonRefs, toast, setToast,
    addEntry, startGame, startNewRound, guessAuthor, onEntryClick: setGuessingEntry,
    sortedEntriesForDisplay, guessedNames, notGuessedNames, allGuessed, isLastEntry, isMyTurn, uniqueNames
  };
}
