import React, {useRef, useState, useEffect, useMemo} from "react";
import axios from "axios";
import {useParams} from "react-router-dom";
import logo from "../src/assets/logo.jpg";
import {io} from 'socket.io-client';
import {motion} from "framer-motion";
import confetti from "canvas-confetti";


// Set backend API base URL
// axios.defaults.baseURL = process.env.NODE_ENV === 'production'
//     ? 'https://game-of-thingies.onrender.com'  // Production
//     : 'http://localhost:3001'                  // Local dev
// Local:
// axios.defaults.baseURL = "http://localhost:3001";
axios.defaults.baseURL = "https://game-of-thingies.onrender.com";
const socket = io('https://game-of-thingies.onrender.com');
// const socket = io(
//     process.env.NODE_ENV === 'production'
//         ? 'https://game-of-thingies.onrender.com'  // Production
//         : 'http://localhost:3001'                  // Local dev
// );


interface Entry {
  entryId: string;
  gameId: string;
  authorName: string;
  text: string;
  createdAt: string;
  revealed?: boolean;
  guessed?: boolean;
}

interface Score {
  playerName: string;
  score: number;

}


export default function StartGamePage() {
  const {gameId} = useParams();
  const [gameTitle, setGameTitle] = useState<string | null>(null);
  const [gameQuestion, setGameQuestion] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entryText, setEntryText] = useState("");
  const [authorName, setAuthorName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    const saved = window.localStorage.getItem("got_authorName");
    return saved ?? "";
  });

  const [started, setStarted] = useState(false);
  const [scores, setScores] = useState<Score[]>([]);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);        // For Start button
  const [addEntryLoading, setAddEntryLoading] = useState(false);  // ← NEW for Add Entry
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [startNewRoundLoading, setStartNewRoundLoading] = useState(false);
  const [showScores, setShowScores] = useState<boolean>(false);


  // State for the entry currently being guessed (for modal)
  const [guessingEntry, setGuessingEntry] = useState<Entry | null>(null);
  const [guessedEntryIds, setGuessedEntryIds] = useState<Set<string>>(new Set());

  // New question input state for starting a new round
  const [newQuestion, setNewQuestion] = useState("");
// sort so enabled (clickable) entries appear first, then fall back to text sort
  const isEntryEnabled = (entry: Entry) =>
      started && !entry.guessed && !(entry.revealed && guessedEntryIds.has(entry.entryId));

  const sortedEntriesForDisplay = useMemo(() => {
    // 1. Create a shallow copy of entries to avoid mutating state directly
    let sorted = [...entries];

    if (started) {
      // AFTER START: Sort alphabetically by the answer text
      // This helps scramble them relative to who typed them,
      // preventing people from guessing "Oh, Alice typed last, so this last one is hers."
      sorted.sort((a, b) => a.text.localeCompare(b.text));
    } else {
      // BEFORE START: Sort by creation time (Oldest -> Newest)
      // This ensures new entries appear at the bottom
      sorted.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateA - dateB;
      });
    }

    return sorted;
  }, [entries, started]);


  const triggerConfetti = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: {y: 0.6},
      colors: ['#26ccff', '#a25afd', '#ff5e7e', '#88ff5a', '#fcff42', '#ffa62d', '#ff36ff']
    });
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  // At the top of the page, show who has / hasn't been guessed yet
  const guessedNames = Array.from(
      new Set(
          entries
              .filter(e => e.guessed)
              .map(e => e.authorName)
      )
  ).sort((a, b) => a.localeCompare(b));

  const notGuessedNames = Array.from(
      new Set(
          entries
              .filter(e => !e.guessed)
              .map(e => e.authorName)
      )
  ).sort((a, b) => a.localeCompare(b));


  // Check if all entries have been guessed
  const allGuessed = entries.length > 0 && entries.every(entry => entry.guessed);
  const [guessLoading, setGuessLoading] = useState(false);

// Add these states after your existing state declarations
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
    duration?: number;
  } | null>(null);

  useEffect(() => {
    if (!toast) return;

    console.log("Toast timer started:", toast.duration || 4000); // DEBUG

    const timer = setTimeout(() => {
      console.log("Toast timer expired"); // DEBUG
      setToast(null);
    }, toast.duration || 5000);  // 5 seconds minimum

    return () => {
      clearTimeout(timer);
      console.log("Toast timer cleared"); // DEBUG
    };
  }, [toast?.message, toast?.duration]); // ✅ Key fix: specific deps


  // useEffect(() => {
  //   if (toast) {
  //     const timer = setTimeout(() => setToast(null), 2000);
  //     return () => clearTimeout(timer);
  //   }
  // }, [toast]);

  useEffect(() => {
    if (authorName.trim() === "") return;
    window.localStorage.setItem("got_authorName", authorName);
  }, [authorName]);

  useEffect(() => {
    if (!gameId) return;
    fetchScores();
  }, [gameId, started]);

  const fetchGameData = async () => {
    if (!gameId) return;
    try {
      const res = await axios.get(`/api/games/${gameId}`);
      // Update your state here (e.g., setGameQuestion, setStarted, etc.)
      setGameQuestion(res.data.question || null);
      setGameTitle(res.data.gameOwner || null);
      // setStarted(res.data.started);
    } catch (err) {
      console.error("Failed to fetch game data", err);
    }
  };

// 2. Update your existing useEffect to just call it
  useEffect(() => {
    fetchGameData();
  }, [gameId]);

  // Fetch entries
  useEffect(() => {
    fetchEntries();
    // eslint-disable-next-line
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;

    console.log("🎮 Joining game:", gameId); // Debug
    socket.emit("joinGame", gameId);

    socket.on("entriesUpdated", () => {
      console.log("📝 Entries updated!");
      fetchEntries();
    });

    socket.on("gameStarted", () => {
      console.log("🚀 Game started!");
      fetchGameData();
      fetchEntries();
      setToast({
        message: "‼️The game has started ‼️",
        type: 'success'
      });
    });

    socket.on("wrongAnswer", (data) => {
      console.log("❌ Wrong guess by:", data.playerName);

      // Refresh entries (in case UI state changed)
      fetchEntries();

      // Show "wrong" toast for everyone
      setToast({
        message: `❌ ${data.playerName} guessed wrong for '${data.guess}'!`,
        type: 'error',
        duration: 7000
      });
    });


    socket.on("gameReset", () => {
      console.log("🔄 Game reset! Refreshing everything...");
      fetchGameData();
      fetchEntries();
      fetchScores();

      setToast({
        message: "‼️A new question has been asked – add your answer",
        type: 'success'
      });
    });


    socket.on("scoreUpdated", (data) => {
      console.log("⭐ Score:", data);
      fetchScores();
      triggerConfetti();
      setToast({
        message: `🎉 ${data?.playerName || 'Someone'} got it right! The answer was '${data?.guess}', written by ${data?.authorName}`,
        type: 'success',
        duration: 7000
      });
    });

    return () => {
      socket.off("entriesUpdated");
      socket.off("gameStarted");
      socket.off("scoreUpdated");
      socket.off("wrongAnswer");
      socket.off("gameReset");
    };
  }, [gameId]);

  const fetchScores = async () => {
    if (!gameId) return;
    try {
      const res = await axios.get<Score[]>(`/api/games/${gameId}/scores`);
      const sorted = [...res.data].sort((a, b) => b.score - a.score);
      setScores(sorted);
    } catch (err) {
      console.error("Error fetching scores", err);
    }
  };


  const fetchEntries = async () => {
    if (!gameId) {
      console.error("No gameId in route params");
      return;
    }

    try {
      const res = await axios.get(`/api/games/${gameId}/entries`);

      const sortedEntries = (res.data ?? []).slice().sort(
          (a: Entry, b: Entry) =>
              a.text.localeCompare(b.text, undefined, {sensitivity: "base"})
          // or use a.authorName.localeCompare(b.authorName, ...) to sort by name
      );

      setEntries(sortedEntries);
      if (sortedEntries.some((e: Entry) => e.revealed)) {
        setStarted(true);
      } else {
        setStarted(false);
      }
    } catch (err) {
      console.error("Error fetching entries", err);
    }
  };

  const onEntryClick = (entry: Entry) => {
    setGuessingEntry(entry);
  };

  const addEntry = async () => {
    if (started || !entryText || !authorName) return;

    setAddEntryLoading(true);

    const startTime = Date.now();

    try {
      await axios.post(`/api/games/${gameId}/entries`, {
        authorName,
        text: entryText,
      });

      setEntryText("");
      // setAuthorName("");
      await fetchEntries();

      const elapsed = Date.now() - startTime;
      const remaining = 1000 - elapsed; // 1 seconds total
      console.log("Elapsed time for addEntry:", elapsed);
      console.log("remaining time for addEntry:", remaining);
      if (remaining > 0) {
        await sleep(remaining);
      }
      setToast({message: "Entry added!", type: "success"});
    } catch (error) {
      console.error("Error adding entry", error);
      setToast({message: "Failed to add entry", type: "error"});
    } finally {


      setAddEntryLoading(false);
    }
  };

  const startGame = async () => {
    if (!entries.length) {
      setToast({message: 'Add some entries first!', type: 'error'});
      return;
    }

    setIsLoading(true);  // ← Start loading

    try {
      await axios.post(`/api/games/${gameId}/start`);
      setStarted(true);
      await fetchEntries();
      await fetchScores();
    } catch (error: any) {
      console.error("Error starting game", error);

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


  const startNewRound = async () => {
    setStartNewRoundLoading(true);
    try {
      await axios.post(`/api/games/${gameId}/reset`, {
        question: newQuestion.trim(),
      });
      setNewQuestion("");
      setEntries([]); // Clear immediately
      setGuessedEntryIds(new Set());
      setStarted(false); // Back to entry submission mode
      window.location.reload(); // Game data will refresh via useEffect
    } catch (err) {
      console.error("Reset failed", err);
    } finally {
      setStartNewRoundLoading(false);
    }
  };


  const guessAuthor = async (entryId: string, guess: string) => {
    setGuessLoading(true);
    await sleep(1500); // artificial delay for UX

    try {
      console.log("authorName:", authorName);
      const {data} = await axios.post(
          `/api/games/${gameId}/entries/${entryId}/guess`,
          {guesserName: authorName, guess}
      );

      if (data.isCorrect && data.entry) {
        // Update this entry as guessed
        setEntries(prev =>
            prev.map(e =>
                e.entryId === data.entry.entryId ? data.entry : e
            )
        );

        setGuessedEntryIds(prev => {
          const next = new Set(prev);
          next.add(entryId);
          return next;
        });

        setToast({message: "Correct!", type: "success"});

        // Scores changed → refresh scoreboard
        await fetchScores();
      } else {
        setToast({message: "Wrong answer!", type: "error", duration: 7000});// longer for wrong answer
      }
    } catch (err) {
      console.error("Error submitting guess", err);
    } finally {
      setGuessLoading(false);
      setGuessingEntry(null); // close modal after result
    }
  };


  // Get list of unique author names for guessing
  const uniqueNames = Array.from(new Set(entries.map(e => e.authorName)));

  return (

      <div style={{textAlign: "center", marginBottom: 20}}>
        <img src={logo} alt="Game of Things" style={{width: 80}}/>
        {/* Game title / ID / question */}
        <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "center",
              gap: 12,
              marginBottom: 4,
            }}
        >
          <h2 style={{margin: 0}}>{gameTitle ?? gameId}</h2>
          {gameId && (
              <span
                  style={{
                    color: "#3c3c4399",
                    fontSize: 14,
                  }}
              >
      (ID: {gameId})
    </span>
          )}
        </div>

        {gameQuestion && (
            <p style={{fontSize: 18, marginBottom: 20}}>{gameQuestion}</p>
        )}


        {/*Scoreboard*/}
        {scores.length > 0 && (
            <div
                style={{
                  maxWidth: 600,
                  margin: "0 auto 12px auto",
                  display: "flex",
                  justifyContent: "flex-end",
                }}
            >
              <button
                  onClick={() => setShowScores(prev => !prev)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#007aff",
                    fontSize: 14,
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
              >
                {showScores ? "Hide scoreboard" : "Show scoreboard"}
              </button>
            </div>
        )}

        {scores.length > 0 && showScores && (
            <div
                style={{
                  marginBottom: 20,
                  padding: "12px 16px",
                  borderRadius: 16,
                  backgroundColor: "#f2f2f7",
                  maxWidth: 600,
                  marginInline: "auto",
                  fontSize: 14,
                }}
            >
              <div
                  style={{
                    marginBottom: 8,
                    fontWeight: 700,
                    textAlign: "left",
                    color: "#1d1d1f",
                  }}
              >
                Scoreboard
              </div>

              {scores.map((s, index) => {
                const rank = index + 1;

                let bg = "#0f5cc0"; // default dark blue
                let text = "white";

                if (rank === 1) bg = "#f6c453";      // gold
                else if (rank === 2) bg = "#c0c4cc"; // silver
                else if (rank === 3) bg = "#cd7f32"; // bronze

                return (
                    <div
                        key={s.playerName}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginTop: 6,
                          padding: "8px 10px",
                          borderRadius: 999,
                          backgroundColor: bg,
                          color: text,
                        }}
                    >
                      <span style={{fontWeight: 600, minWidth: 20}}>#{rank}</span>
                      <span style={{flex: 1, marginLeft: 8, textAlign: "left"}}>
            {s.playerName}
          </span>
                      <span style={{fontWeight: 700}}>{s.score}</span>
                    </div>
                );
              })}
            </div>
        )}


        {/* NEW: Guess status summary */}
        {started && (
            <div
                style={{
                  marginBottom: 20,
                  padding: "10px 14px",
                  borderRadius: 12,
                  backgroundColor: "#f2f2f7",
                  fontSize: 14,
                  textAlign: "left",
                  maxWidth: 600,
                  marginInline: "auto",
                }}
            >
              <div style={{marginBottom: 6}}>
                <strong>Not yet guessed:</strong>{" "}
                {notGuessedNames.length
                    ? notGuessedNames.join(", ")
                    : "Everyone has been guessed!"}
              </div>
              <div>
                <strong>Already guessed:</strong>{" "}
                {guessedNames.length ? guessedNames.join(", ") : "No one yet"}
              </div>
            </div>
        )}


        {!started && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              alignItems: 'center',
              marginTop: 16
            }}>

              {/* Your Entry Input */}
              <input
                  value={entryText}
                  onChange={e => setEntryText(e.target.value)}
                  placeholder="Your answer"
                  disabled={isLoading || addEntryLoading}
                  style={{
                    width: '100%',
                    maxWidth: 400,
                    padding: '12px 16px',
                    fontSize: 16,
                    borderRadius: 12,
                    border: '1px solid #d1d1d6'
                  }}
              />

              {/* Your Name Input */}
              <input
                  value={authorName}
                  onChange={e => setAuthorName(e.target.value)}
                  placeholder="Your name"
                  disabled={isLoading || addEntryLoading}
                  style={{
                    width: '100%',
                    maxWidth: 400,
                    padding: '12px 16px',
                    fontSize: 16,
                    borderRadius: 12,
                    border: '1px solid #d1d1d6'
                  }}
              />

              {/* Buttons Row */}
              <div style={{
                display: 'flex',
                gap: 16,
                width: '100%',
                maxWidth: 400,
                justifyContent: 'center'
              }}>
                <button
                    onClick={addEntry}
                    disabled={isLoading || addEntryLoading || !entryText || !authorName}
                    style={{
                      flex: 1,
                      maxWidth: 140,
                      background: addEntryLoading
                          ? '#c7c7cc'
                          : entryText && authorName
                              ? '#007aff'
                              : '#c7c7cc',
                      color: addEntryLoading
                          ? 'white'
                          : entryText && authorName
                              ? 'white'
                              : '#86868b',
                      opacity: isLoading || addEntryLoading || !entryText || !authorName ? 0.6 : 1,
                      cursor: isLoading || addEntryLoading || !entryText || !authorName ? 'not-allowed' : 'pointer',
                      padding: '14px 24px',
                      borderRadius: 12,
                      border: 'none',
                      fontWeight: 600,
                      fontSize: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                >
                  {addEntryLoading ? (
                      <>
      <span
          style={{
            display: 'inline-block',
            width: 16,
            height: 16,
            borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.5)',
            borderTopColor: 'white',
            animation: 'spin 1s linear infinite',
          }}
      />
                        Saving...
                      </>
                  ) : (
                      'Add Answer'
                  )}
                </button>


                <button
                    onClick={() => setShowStartConfirm(true)}
                    disabled={!entries.length || started || isLoading}
                    style={{
                      flex: 1,
                      maxWidth: 140,
                      background: entries.length && !started && !isLoading ? '#34c759' : '#c7c7cc',
                      color: entries.length && !started && !isLoading ? 'white' : '#86868b',
                      opacity: isLoading ? 0.6 : 1,
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      padding: '14px 24px',
                      borderRadius: 12,
                      border: 'none',
                      fontWeight: 600,
                      fontSize: 16
                    }}
                >
                  {isLoading ? (
                      <>
                        <span style={{ /* spinner styles */}}/>
                        Starting...
                      </>
                  ) : (
                      'Start'
                  )}
                </button>
              </div>
            </div>
        )}
        {guessingEntry && (
            <div
                className="guess-overlay"
                onClick={() => setGuessingEntry(null)}
            >
              <div
                  className="guess-modal"
                  onClick={e => e.stopPropagation()}
              >
                <h4>Who wrote this?</h4>

                <div className="guess-list">
                  <ul>
                    {(() => {
                      const enabledNames: string[] = [];
                      const disabledNames: string[] = [];

                      uniqueNames.forEach(name => {
                        const authorAllGuessed = entries
                            .filter(e => e.authorName === name)
                            .every(e => e.guessed);

                        if (authorAllGuessed) {
                          disabledNames.push(name);
                        } else {
                          enabledNames.push(name);
                        }
                      });

                      const renderName = (name: string, disabled: boolean) => (
                          <li key={name}>
                            <button
                                disabled={disabled || !guessingEntry || guessLoading}
                                onClick={() => {
                                  if (!guessingEntry || disabled || guessLoading) return;
                                  guessAuthor(guessingEntry.entryId, name);
                                }}
                                style={{
                                  width: "75%",
                                  padding: "12px 14px",
                                  borderRadius: 12,
                                  border: "none",
                                  textAlign: "center",
                                  backgroundColor:
                                      disabled || guessLoading ? "#e5e5ea" : "#007aff",
                                  color:
                                      disabled || guessLoading ? "#8e8e93" : "white",
                                  cursor:
                                      disabled || guessLoading ? "default" : "pointer",
                                }}

                            >
                              {name}
                            </button>
                          </li>
                      );

                      return (
                          <>
                            {enabledNames.map(name => renderName(name, false))}
                            {disabledNames.map(name => renderName(name, true))}
                          </>
                      );
                    })()}
                  </ul>
                </div>
                {guessLoading && (
                    <div
                        style={{
                          marginTop: 16,
                          fontSize: 15,
                          fontWeight: 600,
                          color: "#007aff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 10,
                        }}
                    >
                      <span
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: "50%",
                            border: "2px solid rgba(0,122,255,0.3)",
                            borderTopColor: "#007aff",
                            animation: "spin 0.9s linear infinite",
                          }}
                      />
                      Guessing...
                    </div>
                )}


                <button
                    className="cancel-button"
                    onClick={() => setGuessingEntry(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
        )}


        {showStartConfirm && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2000
            }}>
              <div style={{
                background: 'white',
                borderRadius: 20,
                padding: 32,
                maxWidth: 400,
                textAlign: 'center',
                boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
              }}>
                <h3 style={{margin: '0 0 16px', fontSize: 24, fontWeight: 600}}>
                  👥 Is everyone ready?
                </h3>
                <p style={{margin: '0 0 32px', color: '#3c3c43', fontSize: 16}}>
                  Starting the game will reveal all answers and block folks from adding
                  their answers. Once you press Start, read out all the prompts and then tell
                  everyone to refresh the page.
                </p>
                <div style={{display: 'flex', gap: 12, justifyContent: 'center'}}>
                  <button
                      onClick={() => {
                        setShowStartConfirm(false);
                        startGame();  // Proceed with start
                      }}
                      style={{
                        flex: 1,
                        background: '#34c759',
                        color: 'white',
                        padding: '14px 24px',
                        borderRadius: 12,
                        border: 'none',
                        fontWeight: 600,
                        fontSize: 16,
                        cursor: 'pointer'
                      }}
                  >
                    Yes, Start Game!
                  </button>
                  <button
                      onClick={() => setShowStartConfirm(false)}
                      style={{
                        flex: 1,
                        background: '#f2f2f7',
                        color: '#007aff',
                        padding: '14px 24px',
                        borderRadius: 12,
                        border: 'none',
                        fontWeight: 600,
                        fontSize: 16,
                        cursor: 'pointer'
                      }}
                  >
                    Wait, Not Yet
                  </button>
                </div>
              </div>
            </div>
        )}

        {allGuessed && (
            <div style={{marginTop: 30}}>
              <input
                  type="text"
                  placeholder="Game Over! Ask a new question?"
                  value={newQuestion}
                  onChange={e => setNewQuestion(e.target.value)}
                  disabled={startNewRoundLoading}
                  style={{
                    padding: "12px 16px",
                    fontSize: 16,
                    width: "70%",
                    borderRadius: 12,
                    border: "1px solid #d1d1d6",
                    marginRight: 12,
                  }}
              />
              <button
                  disabled={!newQuestion.trim() || startNewRoundLoading}
                  onClick={startNewRound}
                  style={{
                    background: startNewRoundLoading || !newQuestion.trim()
                        ? "#c7c7cc"
                        : "#34c759",
                    color: startNewRoundLoading || !newQuestion.trim()
                        ? "#86868b"
                        : "white",
                    padding: "12px 16px",
                    borderRadius: 12,
                    border: "none",
                    fontWeight: 600,
                    cursor:
                        startNewRoundLoading || !newQuestion.trim()
                            ? "not-allowed"
                            : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    whiteSpace: "nowrap",
                  }}
              >
                {startNewRoundLoading ? (
                    <>
      <span
          style={{
            display: "inline-block",
            width: 16,
            height: 16,
            borderRadius: "50%",
            border: "2px solid rgba(255,255,255,0.5)",
            borderTopColor: "white",
            animation: "spin 1s linear infinite",
          }}
      />
                      Starting...
                    </>
                ) : (
                    "Start New Round"
                )}
              </button>

            </div>
        )}


        <ul>
          {started && (
              <p style={{marginBottom: 12, fontWeight: 600, color: "#1d1d1f"}}>
                Your Group's Answers:
              </p>
          )}
          {sortedEntriesForDisplay.length === 0 && <li>No entries found</li>}

          {sortedEntriesForDisplay.map(entry => (
              <motion.li  // ← Only change: motion.li instead of li
                  key={entry.entryId}
                  style={{margin: "10px 0"}}
                  initial={{opacity: 0, y: 10}}
                  animate={{opacity: 1, y: 0}}
                  transition={{duration: 0.2}}
              >

                {started ? (
                    <button
                        ref={el => {
                          buttonRefs.current[entry.entryId] = el;
                        }}
                        disabled={entry.guessed || (entry.revealed && guessedEntryIds.has(entry.entryId))}
                        onClick={() => onEntryClick(entry)}
                    >
                      {entry.text}
                    </button>
                ) : (
                    <span style={{
                      filter: "blur(6px)",
                      color: "rgba(0,0,0,0.6)",
                      userSelect: "none",
                      textShadow: "0 0 2px rgba(0,0,0,0.1)",
                      transition: "filter 0.3s ease, color 0.3s ease",
                    }}>
                {entry.text}
        </span>
                )}
              </motion.li>
          ))}
        </ul>

        {/* How to play toggle at bottom-left */}
        <div
            style={{
              maxWidth: 600,
              margin: "24px auto 0 auto",
              display: "flex",
              justifyContent: "flex-start",
              alignItems: "center",
              gap: 8,
            }}
        >
          <button
              onClick={() => setShowHowToPlay(prev => !prev)}
              aria-label="How to play"
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                border: "none",
                backgroundColor: "#e5e5ea",
                color: "#007aff",
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
              }}
          >
            i
          </button>
          <span style={{fontSize: 14, color: "#3c3c43"}}>
  </span>
        </div>

        {showHowToPlay && (
            <div
                style={{
                  maxWidth: 600,
                  margin: "8px auto 20px auto",
                  padding: "12px 16px",
                  borderRadius: 12,
                  backgroundColor: "#f2f2f7",
                  fontSize: 14,
                  color: "#3c3c43",
                  lineHeight: 1.5,
                  textAlign: "left",
                }}
            >
              <p style={{marginTop: 0, marginBottom: 8}}>
                How to play: Each person secretly writes an answer to the question and adds it to
                the list.
              </p>
              <p style={{margin: 0, marginBottom: 8}}>
                When the host starts the game, all answers are revealed. Taking turns, tap an
                answer and then choose who you think wrote it. If you're right, you go again!
              </p>
              <p style={{margin: 0}}>
                Correct guesses mark that person as guessed. Keep going until everyone has
                been guessed, then ask a new question and start a new round.
              </p>
            </div>
        )}

        {/* Toast Notification */}
        {toast && (
            <div
                style={{
                  position: 'fixed',
                  top: '20px',          // Distance from top
                  left: 0,
                  width: '100%',        // Span full width to allow flex centering
                  display: 'flex',
                  justifyContent: 'center',
                  zIndex: 2000,
                  pointerEvents: 'none', // Allow clicks to pass through the invisible container
                }}
            >
              <div
                  className="toast-notification"
                  style={{
                    backgroundColor: toast.type === 'success' ? '#34c759' : '#ff3b30',
                    color: 'white',
                    padding: '12px 20px',
                    borderRadius: '12px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                    fontWeight: 600,
                    fontSize: '16px',
                    animation: 'fadeScaleIn 0.4s ease-out forwards',
                    textAlign: 'center',
                    minWidth: '220px',
                    maxWidth: '90%',       // Prevents cropping on small mobile screens
                    pointerEvents: 'auto', // Re-enable clicks on the toast itself
                  }}
              >
                {toast.message}
              </div>
            </div>
        )}


      </div>
  );
}
