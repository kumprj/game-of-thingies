import React, {useState} from "react";
import axios from "axios";
import {useNavigate} from "react-router-dom";
import logo from "../src/assets/logo.jpg";  // adjust path accordingly

// Set backend API base URL
axios.defaults.baseURL = "https://9ozslu6x6l.execute-api.us-east-1.amazonaws.com/dev";

export default function HomePage() {
  const [gameName, setGameName] = useState("");
  const navigate = useNavigate();
  const [questionText, setQuestionText] = useState("");
  const [joinGameId, setJoinGameId] = useState("");


  const createGame = async () => {
    if (!gameName || !questionText) return;
    const {data} = await axios.post("/api/createGame", {name: gameName, question: questionText});
    navigate(`/${data.gameId}`);
  };


  return (
      <div style={{textAlign: "center", marginTop: 40}}>
        <img src={logo} alt="Game of Things" style={{width: 120, marginBottom: 20}}/>
        <h1>Game of Things</h1>
        <input
            value={gameName}
            onChange={(e) => setGameName(e.target.value)}
            placeholder="Enter game name"
        />
        <input
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            placeholder="What question would you like to ask?"
        />

        <button onClick={createGame} disabled={!gameName}>
          Create Game
        </button>
        <div>
          <h2>Join Existing Game</h2>
          <input
              value={joinGameId}
              onChange={(e) => setJoinGameId(e.target.value.toUpperCase())} // uppercase optional
              placeholder="Enter 4-letter game code"
              maxLength={4}
          />
          <button
              onClick={() => {
                if (joinGameId.length === 4) {
                  navigate(`/${joinGameId}`);
                } else {
                  alert("Please enter a valid 4-letter game code");
                }
              }}
          >
            Join Game
          </button>
        </div>

      </div>

  );
}
