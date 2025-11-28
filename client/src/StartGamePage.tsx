import React, {useRef, useState, useEffect} from "react";
import axios from "axios";
import {useParams} from "react-router-dom";
import logo from "../src/assets/logo.jpg";

// Set backend API base URL
axios.defaults.baseURL = "https://i7v5llgsek.execute-api.us-east-1.amazonaws.com/dev";

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
      setEntries(res.data || []);
      if ((res.data || []).some((e: Entry) => e.revealed)) {
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
    if (started) return; // Prevent adding if game started
    if (!entryText || !authorName) return;
    try {
      await axios.post(`/api/games/${gameId}/entries`, {
        authorName,
        text: entryText,
      });
      setEntryText("");
      setAuthorName("");
      fetchEntries();
    } catch (error) {
      console.error("Error adding entry", error);
    }
  };

  // Modified startGame to only start without new question
  const startGame = async () => {
    try {
      await axios.post(`/api/games/${gameId}/start`);
      setStarted(true);
      fetchEntries();
    } catch (error) {
      console.error("Error starting game", error);
    }
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
            <div>
              <input
                  value={entryText}
                  onChange={e => setEntryText(e.target.value)}
                  placeholder="Your answer"
              />
              <input
                  value={authorName}
                  onChange={e => setAuthorName(e.target.value)}
                  placeholder="Your name"
              />
              <button onClick={addEntry} disabled={!entryText || !authorName}>
                Add Entry
              </button>
              <button onClick={startGame}>Start</button>
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
                    <span style={{filter: "blur(4px)"}}>{entry.text}</span>
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
