import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

// Set backend API base URL
axios.defaults.baseURL = "http://localhost:3001";

export default function HomePage() {
  const [gameName, setGameName] = useState("");
  const navigate = useNavigate();

  const createGame = async () => {
    if (!gameName) return;
    const { data } = await axios.post("/api/createGame", { name: gameName });
    navigate(`${data.gameId}`);
  };

  return (
      <div>
        <h1>Game of Thinigies</h1>
        <input
            value={gameName}
            onChange={(e) => setGameName(e.target.value)}
            placeholder="Enter game name"
        />
        <button onClick={createGame} disabled={!gameName}>
          Create Game
        </button>
      </div>
  );
}
