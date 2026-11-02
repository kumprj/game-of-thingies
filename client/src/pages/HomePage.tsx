import React, {useState, useEffect} from "react";
import axios from "axios";
import {useNavigate} from "react-router-dom";
import {AnimatePresence, motion} from "framer-motion";
import TopBar from "../components/TopBar";
import logo from "../assets/logo.svg";
import {API_URL} from "../apiUrl";
import {saveHostToken} from "../hostToken";
import {getRecentGames, removeRecentGame, saveRecentGame, RecentGame} from "../recentGames";

axios.defaults.baseURL = API_URL;

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// Same limits as the server (server/gameSetup.ts)
const MAX_GAME_NAME_LENGTH = 50;
const MAX_QUESTION_LENGTH = 200;

export default function HomePage() {
  const [gameName, setGameName] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [joinGameId, setJoinGameId] = useState("");
  const [creatingGame, setCreatingGame] = useState(false);
  const [recentGames, setRecentGames] = useState<RecentGame[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setRecentGames(getRecentGames());
  }, []);

  const createGame = async () => {
    if (!gameName.trim() || !questionText.trim()) return;

    setCreatingGame(true);
    setToastMessage(null);

    try {
      const {data} = await axios.post("/api/createGame", {
        name: gameName.trim(),
        question: questionText.trim()
      });
      if (data.hostToken) saveHostToken(data.gameId, data.hostToken);
      saveRecentGame(data.gameId, gameName.trim());
      navigate(`/${data.gameId}`);
    } catch (error) {
      console.error("Create game failed", error);
      const serverMessage = (error as any)?.response?.data?.error;
      const msg = serverMessage || "Failed to create game. Please try again.";
      setToastMessage(msg);
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(msg);
      }
    } finally {
      setCreatingGame(false);
    }
  };

  const handleJoin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!joinDisabled) {
      navigate(`/${joinGameId}`);
    }
  };

  const handleDeleteRecent = (code: string) => {
    removeRecentGame(code);
    setRecentGames(getRecentGames());
  };

  const createDisabled = creatingGame || !gameName.trim() || !questionText.trim();

  // Exactly 4 uppercase letters A–Z
  const joinCodeValid = /^[A-Z]{4}$/.test(joinGameId);
  const joinDisabled = creatingGame || !joinCodeValid;

  return (
      <div className="page">
        <TopBar/>

        <div className="game-header">
          <img src={logo} alt="" className="app-icon" width={96} height={96}/>
          <h1 style={{marginTop: 12}}>Game of Things</h1>
          <p>Guess who wrote what.</p>
        </div>

        <AnimatePresence>
          {toastMessage && (
            <motion.div
              key="toast"
              className="toast-wrap"
              role="status"
              aria-live="polite"
              initial={{opacity: 0, y: "-100%"}}
              animate={{opacity: 1, y: 0}}
              exit={{opacity: 0, y: "-100%"}}
              transition={{duration: 0.25, ease: EASE_OUT}}
            >
              <div className="toast error">
                <span className="toast-dot" aria-hidden="true"/>
                {toastMessage}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <section className="stack">
          <h4 className="section-label">New Game</h4>
          <form onSubmit={(e) => { e.preventDefault(); createGame(); }} className="stack" style={{gap: 8}}>
            <input
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
                placeholder="Enter a title for your game"
                aria-label="Title for your game"
                maxLength={MAX_GAME_NAME_LENGTH}
                disabled={creatingGame}
            />
            <input
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                placeholder="What question would you like to ask?"
                aria-label="What question would you like to ask?"
                maxLength={MAX_QUESTION_LENGTH}
                disabled={creatingGame}
            />
            <button type="submit" className="btn btn-primary btn-block" disabled={createDisabled}>
              {creatingGame ? <><span className="spinner"/>Creating...</> : 'Create Game'}
            </button>
          </form>
        </section>

        <section className="stack">
          <h4 className="section-label">Join Existing Game</h4>
          <form onSubmit={handleJoin} className="stack" style={{gap: 8}}>
            <input
                value={joinGameId}
                onChange={(e) => setJoinGameId(e.target.value.toUpperCase())}
                placeholder="Enter 4-letter game code"
                aria-label="Enter 4-letter game code"
                maxLength={4}
                autoCapitalize="characters"
                autoCorrect="off"
                disabled={creatingGame}
            />
            <button
                type="submit"
                className="btn btn-tinted btn-block"
                disabled={joinDisabled}
            >
              Join Game
            </button>
          </form>
        </section>

        {recentGames.length > 0 && (
          <section className="stack">
            <h4 className="section-label">Recent Games</h4>
            <ul className="list">
              {recentGames.map((g) => (
                <li key={g.gameId} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px'}}>
                  <button
                    type="button"
                    className="btn-text"
                    style={{textAlign: 'left', flex: 1, padding: 0}}
                    onClick={() => navigate(`/${g.gameId}`)}
                  >
                    <strong>{g.title || g.gameId}</strong>
                    <span className="footnote" style={{display: 'block', opacity: 0.7}}>Code: {g.gameId}</span>
                  </button>
                  <button
                    type="button"
                    className="btn-text btn-destructive"
                    style={{color: '#ff3b30', fontSize: 13, padding: '4px 8px'}}
                    aria-label={`Remove recent game ${g.gameId}`}
                    onClick={() => handleDeleteRecent(g.gameId)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card stack">
          <h3>How to Play</h3>
          <ol className="how-to-play-steps" style={{paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 8}}>
            <li><strong>Create or join:</strong> The host sets a game title and question prompt. Share the 4-letter code with players.</li>
            <li><strong>Submit secretly:</strong> Each player submits their answer and name before the game starts.</li>
            <li><strong>Take turns guessing:</strong> The host starts the game to reveal the shuffled answers. On your turn, pick an answer and guess who wrote it.</li>
            <li><strong>Earn points:</strong> Correct guesses score points and keep your turn. Once all answers are guessed, the host can start a new round!</li>
          </ol>
          <p className="footnote" style={{marginTop: 6}}>Have fun and enjoy the Game of Things!</p>
        </section>
      </div>
  );
}
