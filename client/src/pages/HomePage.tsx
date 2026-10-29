import React, {useState} from "react";
import axios from "axios";
import {useNavigate} from "react-router-dom";
import TopBar from "../components/TopBar";
import logo from "../assets/logo.svg";
import {API_URL} from "../apiUrl";

axios.defaults.baseURL = API_URL;

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

        <section className="stack">
          <h4 className="section-label">New Game</h4>
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
          <button className="btn btn-primary btn-block" onClick={createGame} disabled={createDisabled}>
            {creatingGame ? <><span className="spinner"/>Creating...</> : 'Create Game'}
          </button>
        </section>

        <section className="stack">
          <h4 className="section-label">Join Existing Game</h4>
          <input
              value={joinGameId}
              onChange={(e) => setJoinGameId(e.target.value.toUpperCase())}
              placeholder="Enter 4-letter game code"
              maxLength={4}
              autoCapitalize="characters"
              autoCorrect="off"
              disabled={creatingGame}
          />
          <button
              className="btn btn-tinted btn-block"
              onClick={() => navigate(`/${joinGameId}`)}
              disabled={joinDisabled}
          >
            Join Game
          </button>
        </section>

        <section className="card stack">
          <h3>How to Play</h3>
          <p>
            The game host will enter a game title (this can be anything), and a question prompt to
            ask the room. When the host clicks Create Game, a
            4-letter code will be generated for them to share with people to join the game. Then,
            submit your answer along with your name.
            Once everyone has submitted and the group is ready, the host will click to start the
            game to reveal the shuffled entries.
            When it is your turn, try to guess who wrote each entry—getting correct guesses earns
            points!
            Once all guesses are made, a new question box will pop up to start a new round. The
            player who has gone the longest ago goes first.
          </p>
          <p className="footnote">Have fun and enjoy the Game of Things!</p>
        </section>
      </div>
  );
}
