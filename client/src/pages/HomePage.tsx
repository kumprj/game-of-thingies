import React, {useState, useEffect} from "react";
import axios from "axios";
import {useNavigate} from "react-router-dom";
import logo from "../assets/logo.jpg";

axios.defaults.baseURL = process.env.NODE_ENV === 'production'
    ? 'https://game-of-thingies.onrender.com'  // Production
    : 'http://localhost:3001'                  // Local dev
// axios.defaults.baseURL = "https://game-of-thingies.onrender.com";

export default function HomePage() {
  const [gameName, setGameName] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [joinGameId, setJoinGameId] = useState("");
  const [creatingGame, setCreatingGame] = useState(false);
  const navigate = useNavigate();

  const createGame = async () => {
    if (!gameName.trim() || !questionText.trim()) return;

    setCreatingGame(true);

    try {
      const {data} = await axios.post("/api/createGame", {
        name: gameName.trim(),
        question: questionText.trim()
      });
      navigate(`/${data.gameId}`);
    } catch (error) {
      console.error("Create game failed", error);
      alert("Failed to create game. Please try again.");
    } finally {
      setCreatingGame(false);
    }
  };

  useEffect(() => {
    const warmUp = async () => {
      try {
        await fetch("https://game-of-thingies.onrender.com/warmup", {
          method: "GET",
          cache: "no-store",
        });
      } catch (err) {
        // Non‑fatal: just log, don’t show UI error
        console.warn("Warm‑up failed (ignored):", err);
      }
    };

    warmUp();
  }, []);

  const createDisabled = creatingGame || !gameName.trim() || !questionText.trim();

  // Exactly 4 uppercase letters A–Z
  const joinCodeValid = /^[A-Z]{4}$/.test(joinGameId);
  const joinDisabled = creatingGame || !joinCodeValid;

  return (
      <div style={{textAlign: "center", marginTop: 40}}>
        <img src={logo} alt="Game of Things" style={{width: 120, marginBottom: 20}}/>
        <h1>Game of Things</h1>

        <input
            value={gameName}
            onChange={(e) => setGameName(e.target.value)}
            placeholder="Enter a title for your game"
            disabled={creatingGame}
        />
        <input
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            placeholder="What question would you like to ask?"
            disabled={creatingGame}
        />

        <button
            onClick={createGame}
            disabled={createDisabled}
            style={{
              background: createDisabled ? '#c7c7cc' : '#007aff',
              opacity: createDisabled ? 0.6 : 1,
              cursor: createDisabled ? 'not-allowed' : 'pointer'
            }}
        >
          {creatingGame ? (
              <>
            <span
                style={{
                  display: 'inline-block',
                  width: 16,
                  height: 16,
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderRadius: '50%',
                  borderTopColor: 'white',
                  animation: 'spin 1s linear infinite',
                  marginRight: 8,
                  verticalAlign: 'middle'
                }}
            />
                Creating...
              </>
          ) : (
              'Create Game'
          )}
        </button>

        <div>
          <h2>Join Existing Game</h2>
          <input
              value={joinGameId}
              onChange={(e) => setJoinGameId(e.target.value.toUpperCase())}
              placeholder="Enter 4-letter game code"
              maxLength={4}
              disabled={creatingGame}
          />
          <button
              onClick={() => {
                if (joinCodeValid) {
                  navigate(`/${joinGameId}`);
                } else {
                  alert("Please enter a valid 4-letter game code");
                }
              }}
              disabled={joinDisabled}
              style={{
                background: joinDisabled ? '#c7c7cc' : '#007aff',
                opacity: joinDisabled ? 0.6 : 1,
                cursor: joinDisabled ? 'not-allowed' : 'pointer'
              }}
          >
            Join Game
          </button>
        </div>

        <div
            style={{
              marginTop: 20,
              padding: 16,
              backgroundColor: '#f0f0f5',
              borderRadius: 12,
              maxWidth: 600,
              marginLeft: 'auto',
              marginRight: 'auto',
              color: '#3c3c43'
            }}
        >
          <h3>How to Play</h3>
          <p>
            The game host will enter a game title (this can be anything), and a question prompt to
            ask the room. When the host clicks Create Game, a
            4-digit code will be generated for them to share with people to join the game. Then,
            submit your answer along with your name.
            Once everyone has submitted and the group is ready, the host will click to start the
            game to reveal the shuffled entries.
            When it is your turn, try to guess who wrote each entry-getting correct guesses earns
            points!
            Once all guesses are made, a new question box will pop up to start a new round.
          </p>
          <p style={{fontSize: 14, color: '#6e6e73'}}>
            Have fun and enjoy the Game of Things!
          </p>
        </div>
      </div>
  );
}
