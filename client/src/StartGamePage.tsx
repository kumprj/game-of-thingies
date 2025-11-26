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
}

export default function StartGamePage() {
  const {gameId} = useParams();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entryText, setEntryText] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    fetchEntries();
    // eslint-disable-next-line
  }, [gameId]);

  const fetchEntries = async () => {
    if (!gameId) return;

    try {
      const res = await axios.get(`/api/games/${gameId}/entries`);
      setEntries(res.data || []);
      // If any entry is revealed, mark game as started
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
    if (started) return; // Prevent adding if started
    if (!entryText || !authorName) return;

    await axios.post(`/api/games/${gameId}/entries`, {authorName, text: entryText});
    setEntryText("");
    setAuthorName("");
    fetchEntries();
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
          {
            guesserName: authorName,
            guess,
          }
      );
      alert(data.isCorrect ? "Correct!" : "Try Again!");
      fetchEntries();
    } catch (error) {
      console.error("Error submitting guess", error);
    }
  };

  return (
      <div>
        <h2>Game: {gameId}</h2>

        {!started && (
            <div>
              <input
                  value={entryText}
                  onChange={(e) => setEntryText(e.target.value)}
                  placeholder="Your entry"
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
          {entries.map((entry) => (
              <li key={entry.entryId} style={{margin: "10px 0"}}>
                {started ? (
                    <button
                        onClick={() => {
                          const names = entries.map((e) => e.authorName).join(", ");
                          const guess = window.prompt(
                              `Who wrote this entry? Choose: ${names}`
                          );
                          if (guess) {
                            guessAuthor(entry.entryId, guess);
                          }
                        }}
                        disabled={entry.revealed}
                        style={{
                          backgroundColor: entry.revealed ? "#d3ffd3" : "",
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
      </div>
  );
}
