import React, {useState, useEffect} from "react";
import axios from "axios";
import {useParams} from "react-router-dom";

// Set backend API base URL
axios.defaults.baseURL = "http://localhost:3001";

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
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entryText, setEntryText] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [started, setStarted] = useState(false);

  // State for the entry currently being guessed (for modal)
  const [guessingEntry, setGuessingEntry] = useState<Entry | null>(null);
  const [guessedEntryIds, setGuessedEntryIds] = useState<Set<string>>(new Set());


  useEffect(() => {
    const fetchGameTitle = async () => {
      if (!gameId) return;

      try {
        const res = await axios.get(`/api/games/${gameId}`);
        console.log("Fetched game data:", res.data);

        if (res.data?.gameOwner) {
          setGameTitle(res.data?.gameOwner);
        } else {
          setGameTitle(null);
        }
      } catch (error) {
        console.error("Failed to fetch game title", error);
        setGameTitle(null);
      }
    };

    fetchGameTitle();
  }, [gameId]);


  useEffect(() => {
    fetchEntries();
    // eslint-disable-next-line
  }, [gameId]);

  useEffect(() => {
    console.log("guessingEntry changed:", guessingEntry);
  }, [guessingEntry]);
  const fetchEntries = async () => {
    if (!gameId) {
      console.error("No gameId in route params");
      return;
    }

    try {
      const res = await axios.get(`/api/games/${gameId}/entries`);
      console.log("entries response:", res.data);
      // Backend returns an array, so set directly
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

  const startGame = async () => {
    try {
      await axios.post(`/api/games/${gameId}/start`);
      setStarted(true);
      fetchEntries();
    } catch (error) {
      console.error("Error starting game", error);
    }
  };

  const guessAuthor = async (entryId: string, guess: string) => {
    try {
      const {data} = await axios.post(
          `/api/games/${gameId}/entries/${entryId}/guess`,
          {guesserName: authorName, guess}
      );

      if (data.isCorrect && data.entry) {
        // Update the guessed entry in entries state
        setEntries((prev) =>
            prev.map((e) => (e.entryId === data.entry.entryId ? data.entry : e))
        );
        setGuessedEntryIds(prev => new Set(prev).add(entryId));
        alert("Correct!");
      } else {
        alert("Try Again!");
      }
    } catch (error) {
      console.error("Error submitting guess", error);
    }
  };


  // Get list of unique author names for guessing
  const uniqueNames = Array.from(new Set(entries.map(e => e.authorName)));

  const handleGuess = (guess: string) => {
    if (guessingEntry) {
      guessAuthor(guessingEntry.entryId, guess);
      setGuessingEntry(null); // close modal
    }
  };

  const closeModal = () => {
    setGuessingEntry(null);
  };

  return (
      <div>
        <h2>{gameTitle ?? gameId} {gameId}</h2>

        {!started && (
            <div>
              <input
                  value={entryText}
                  onChange={(e) => setEntryText(e.target.value)}
                  placeholder="Your answer"
              />
              <input
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
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

          {entries.map((entry) => (
              <li key={entry.entryId} style={{margin: "10px 0"}}>
                {started ? (
                    <button
                        onClick={() => setGuessingEntry(entry)}
                        disabled={entry.guessed || (entry.revealed && guessedEntryIds.has(entry.entryId))}
                        style={{
                          backgroundColor: entry.revealed ? "#d3ffd3" : "",
                          color: entry.guessed ? "#888" : "inherit",
                          cursor: entry.guessed ? "not-allowed" : "pointer",
                          opacity: entry.guessed ? 0.6 : 1,
                        }}
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
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  width: "100vw",
                  height: "100vh",
                  backgroundColor: "rgba(0,0,0,0.5)",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  zIndex: 1000,
                }}
            >
              <div
                  style={{
                    border: "3px solid red",
                    backgroundColor: "white",
                    position: "fixed",
                    top: "20%",
                    left: "20%",
                    zIndex: 9999,
                    padding: 20,
                    width: 400,
                  }}
              >
                <h3>Guess who wrote this entry:</h3>
                <p><em>"{guessingEntry.text}"</em></p>
                <ul style={{listStyleType: "none", paddingLeft: 0}}>
                  {uniqueNames.map((name) => (
                      <li key={name} style={{marginBottom: 10}}>
                        <button onClick={() => handleGuess(name)}>{name}</button>
                      </li>
                  ))}
                </ul>
                <button onClick={closeModal} style={{marginTop: 10}}>
                  Cancel
                </button>
              </div>
            </div>
        )}
      </div>
  );
}
