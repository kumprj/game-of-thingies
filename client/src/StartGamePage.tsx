import React, {useRef, useState, useEffect} from "react";
import axios from "axios";
import {useParams} from "react-router-dom";
import logo from "../src/assets/logo.jpg";

// Set backend API base URL
axios.defaults.baseURL = "https://i7v5llgsek.execute-api.us-east-1.amazonaws.com/dev";
// Local:
// axios.defaults.baseURL = "http://localhost:3001";

interface Entry {
  entryId: string;
  gameId: string;
  authorName: string;
  text: string;
  createdAt: string;
  revealed?: boolean;
  guessed?: boolean;
}

export default function StartGamePage() {
  const {gameId} = useParams();
  const [gameTitle, setGameTitle] = useState<string | null>(null);
  const [gameQuestion, setGameQuestion] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entryText, setEntryText] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [started, setStarted] = useState(false);
  const [bubblePosition, setBubblePosition] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);        // For Start button
  const [addEntryLoading, setAddEntryLoading] = useState(false);  // ← NEW for Add Entry


  // State for the entry currently being guessed (for modal)
  const [guessingEntry, setGuessingEntry] = useState<Entry | null>(null);
  const [guessedEntryIds, setGuessedEntryIds] = useState<Set<string>>(new Set());

  // New question input state for starting a new round
  const [newQuestion, setNewQuestion] = useState("");

  // Check if all entries have been guessed
  const allGuessed = entries.length > 0 && entries.every(entry => entry.guessed);
// Add these states after your existing state declarations
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Fetch game title & question
  useEffect(() => {
    const fetchGameData = async () => {
      if (!gameId) return;
      try {
        const res = await axios.get(`/api/games/${gameId}`);
        setGameQuestion(res.data.question || null);
        setGameTitle(res.data.gameOwner || null);
      } catch (error) {
        console.error("Failed to fetch game data", error);
        setGameTitle(null);
        setGameQuestion(null);
      }
    };
    fetchGameData();
  }, [gameId]);

  // Fetch entries
  useEffect(() => {
    fetchEntries();
    // eslint-disable-next-line
  }, [gameId]);

  const fetchEntries = async () => {
    if (!gameId) {
      console.error("No gameId in route params");
      return;
    }

    try {
      const res = await axios.get(`/api/games/${gameId}/entries`);
      const shuffledEntries = res.data?.sort(() => Math.random() - 0.5) || [];
      setEntries(shuffledEntries);

      if (shuffledEntries.some((e: Entry) => e.revealed)) {
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

    const btn = buttonRefs.current[entry.entryId];
    if (btn) {
      const rect = btn.getBoundingClientRect();
      setBubblePosition({
        top: rect.top + window.scrollY,
        left: rect.right + window.scrollX + 10,
      });
    }
  };

  const addEntry = async () => {
    if (started || !entryText || !authorName) return;

    setAddEntryLoading(true);  // ← Start loading

    try {
      await axios.post(`/api/games/${gameId}/entries`, {
        authorName,
        text: entryText,
      });
      setEntryText("");
      setAuthorName("");
      await fetchEntries();  // Refresh entries list
      setToast({message: 'Entry added!', type: 'success'});
    } catch (error) {
      console.error("Error adding entry", error);
      setToast({message: 'Failed to add entry', type: 'error'});
    } finally {
      setAddEntryLoading(false);  // ← Stop loading
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
    } catch (error: any) {
      console.error("Error starting game", error);

      if (error.response?.status === 409) {
        setToast({message: 'Game already started! Refreshing...', type: 'success'});
        setTimeout(() => window.location.reload(), 1500);
        return;
      }

      setToast({message: 'Failed to start game', type: 'error'});
    } finally {
      setIsLoading(false);  // ← Stop loading
    }

    setShowStartConfirm(false);  // Close confirmation modal
  };


  const startNewRound = async () => {
    try {
      await axios.post(`/api/games/${gameId}/reset`, {
        question: newQuestion.trim()
      });
      setNewQuestion("");
      setEntries([]);  // Clear immediately
      setGuessedEntryIds(new Set());
      setStarted(false);  // Back to entry submission mode
      window.location.reload();
      // Game data will refresh via useEffect
    } catch (err) {
      console.error("Reset failed", err);
    }
  };

  const guessAuthor = async (entryId: string, guess: string) => {
    try {
      const {data} = await axios.post(`/api/games/${gameId}/entries/${entryId}/guess`, {
        guesserName: authorName,
        guess,
      });

      if (data.isCorrect && data.entry) {
        // Update the guessed entry in entries state
        setEntries(prev =>
            prev.map(e => (e.entryId === data.entry.entryId ? data.entry : e))
        );
        setGuessedEntryIds(prev => new Set(prev).add(entryId));
        setToast({message: 'Correct!', type: 'success'});
      } else {
        setToast({message: 'AAAAANT. Wrong answer!', type: 'error'});
      }
    } catch (error) {
      console.error("Error submitting guess", error);
    }
  };

  // Get list of unique author names for guessing
  const uniqueNames = Array.from(new Set(entries.map(e => e.authorName)));

  return (

      <div style={{textAlign: "center", marginBottom: 20}}>
        <img src={logo} alt="Game of Things" style={{width: 80}}/>
        <h2>{gameTitle ?? gameId}</h2>
        {gameId && (
            <p style={{color: "#3c3c4399", fontSize: 16, marginTop: -12, marginBottom: 28}}>
              Game ID: {gameId}
            </p>
        )}
        {gameQuestion && (
            <p style={{color: "#3c3c4399", fontSize: 16, marginTop: -12, marginBottom: 28}}>
              {gameQuestion}
            </p>
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
                          : (entryText && authorName)
                              ? '#007aff'
                              : '#c7c7cc',
                      color: addEntryLoading
                          ? 'white'
                          : (entryText && authorName)
                              ? 'white'
                              : '#86868b',
                      opacity: (isLoading || addEntryLoading || !entryText || !authorName) ? 0.6 : 1,
                      cursor: (isLoading || addEntryLoading || !entryText || !authorName) ? 'not-allowed' : 'pointer',
                      padding: '14px 24px',
                      borderRadius: 12,
                      border: 'none',
                      fontWeight: 600,
                      fontSize: 16
                    }}
                >
                  {addEntryLoading ? (
                      <>
                        <span style={{ /* spinner styles */}}/>
                        Adding...
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


        <ul>
          {entries.length === 0 && <li>No entries found</li>}

          {entries.map(entry => (
              <li key={entry.entryId} style={{margin: "10px 0"}}>
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
                      filter: 'blur(4px)',
                      color: 'rgba(0,0,0,0.2)',
                      userSelect: 'none',
                      textShadow: '0 0 2px rgba(0,0,0,0.1)',
                      transition: 'filter 0.3s ease, color 0.3s ease'
                    }}>
                      {entry.text}
                    </span>


                )}
              </li>
          ))}
        </ul>

        {guessingEntry && (
            <div
                className="guess-bubble"
                style={{
                  position: "absolute",
                  top: bubblePosition.top,
                  left: bubblePosition.left,
                  zIndex: 1000,
                }}
            >
              <h4>Who wrote this?</h4>
              <ul>
                {uniqueNames.map(name => {
                  const authorAllGuessed = entries
                      .filter(e => e.authorName === name)
                      .every(e => e.guessed);

                  return (
                      <li key={name}>
                        <button
                            disabled={authorAllGuessed}
                            style={{
                              backgroundColor: authorAllGuessed ? '#c7c7cc' : '#007aff',
                              color: authorAllGuessed ? '#86868b' : 'white',
                              opacity: authorAllGuessed ? 0.6 : 1,
                              cursor: authorAllGuessed ? 'not-allowed' : 'pointer',
                            }}
                            onClick={() => {
                              if (authorAllGuessed) return;
                              guessAuthor(guessingEntry.entryId, name);
                              setGuessingEntry(null);
                            }}
                        >
                          {name}
                        </button>
                      </li>
                  );
                })}
              </ul>
              <button
                  className="cancel-button"
                  onClick={() => setGuessingEntry(null)}
              >
                Cancel
              </button>
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
                  their answers. Once you press Start, tell
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


        {/* NEW Question Input shown after all guessed */}
        {allGuessed && (
            <div style={{marginTop: 30}}>
              <input
                  type="text"
                  placeholder="Ask a new question?"
                  value={newQuestion}
                  onChange={e => setNewQuestion(e.target.value)}
                  style={{
                    padding: "12px 16px",
                    fontSize: 16,
                    width: "70%",
                    borderRadius: 12,
                    border: "1px solid #d1d1d6",
                    marginRight: 12,
                  }}
              />
              <button disabled={!newQuestion.trim()} onClick={startNewRound}>
                Start New Round
              </button>
            </div>
        )}
        {toast && (
            <div
                className="toast-notification"
                style={{
                  position: 'fixed',
                  top: 80,
                  right: 20,
                  backgroundColor: toast.type === 'success' ? '#34c759' : '#ff3b30',
                  color: 'white',
                  padding: '12px 20px',
                  borderRadius: 12,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                  fontWeight: 600,
                  fontSize: 16,
                  zIndex: 2000,
                  transform: 'translateX(100%)',
                  animation: 'slideIn 0.3s ease-out forwards',
                }}
            >
              {toast.message}
            </div>
        )}

      </div>
  );
}
