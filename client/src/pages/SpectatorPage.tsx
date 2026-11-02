import React, {useState, useEffect} from "react";
import {useParams, Link} from "react-router-dom";
import axios, {socket} from "../gameConfig";
import {Entry, Score} from "../../../types";
import Scoreboard from "../components/Scoreboard";
import logo from "../assets/logo.svg";

export default function SpectatorPage() {
  const {gameId} = useParams();
  const [gameTitle, setGameTitle] = useState<string | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [turnOrder, setTurnOrder] = useState<string[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [gameNotFound, setGameNotFound] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);

  // Screen Wake Lock API to prevent TV / display from sleeping
  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && (navigator as any).wakeLock) {
        try {
          wakeLock = await (navigator as any).wakeLock.request('screen');
          setWakeLockActive(true);
          wakeLock.addEventListener('release', () => setWakeLockActive(false));
        } catch {
          setWakeLockActive(false);
        }
      }
    };
    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  useEffect(() => {
    if (!gameId) return;

    let isSubscribed = true;

    const fetchGame = async () => {
      try {
        const res = await axios.get(`/api/games/${gameId}`);
        if (!isSubscribed) return;
        setGameTitle(res.data.title || res.data.gameOwner || null);
        setQuestion(res.data.question || null);
        setStarted(res.data.started === true);
        if (res.data.turnOrder) {
          setTurnOrder(res.data.turnOrder);
          setCurrentPlayer(res.data.turnOrder[0] || null);
        }
      } catch (err: any) {
        if (err?.response?.status === 404) {
          if (isSubscribed) setGameNotFound(true);
        }
      }
    };

    const fetchEntries = async () => {
      try {
        const res = await axios.get(`/api/games/${gameId}/entries`);
        if (isSubscribed) setEntries(res.data ?? []);
      } catch {}
    };

    const fetchScores = async () => {
      try {
        const res = await axios.get<Score[]>(`/api/games/${gameId}/scores`);
        if (isSubscribed) setScores([...res.data].sort((a, b) => b.score - a.score));
      } catch {}
    };

    const sync = () => {
      fetchGame();
      fetchEntries();
      fetchScores();
    };

    sync();

    // Join room for live socket events
    socket.emit("joinGame", gameId);

    const onEntriesUpdated = () => fetchEntries();
    const onGameStarted = (data: any) => {
      setStarted(true);
      if (data?.turnOrder) {
        setTurnOrder(data.turnOrder);
        setCurrentPlayer(data.turnOrder[0] || null);
      }
      sync();
    };
    const onWrongAnswer = () => fetchEntries();
    const onScoreUpdated = () => {
      fetchScores();
      fetchEntries();
    };
    const onNextTurn = (data: any) => {
      setTurnOrder(data.turnOrder || []);
      setCurrentPlayer(data.currentPlayer || null);
    };
    const onPlayerRemoved = (data: any) => {
      if (data?.turnOrder) {
        setTurnOrder(data.turnOrder);
        setCurrentPlayer(data.turnOrder[0] || null);
      }
    };
    const onGameReset = () => {
      setStarted(false);
      sync();
    };

    socket.on("entriesUpdated", onEntriesUpdated);
    socket.on("gameStarted", onGameStarted);
    socket.on("wrongAnswer", onWrongAnswer);
    socket.on("scoreUpdated", onScoreUpdated);
    socket.on("nextTurn", onNextTurn);
    socket.on("playerRemoved", onPlayerRemoved);
    socket.on("gameReset", onGameReset);
    socket.on("connect", sync);

    return () => {
      isSubscribed = false;
      socket.off("entriesUpdated", onEntriesUpdated);
      socket.off("gameStarted", onGameStarted);
      socket.off("wrongAnswer", onWrongAnswer);
      socket.off("scoreUpdated", onScoreUpdated);
      socket.off("nextTurn", onNextTurn);
      socket.off("playerRemoved", onPlayerRemoved);
      socket.off("gameReset", onGameReset);
      socket.off("connect", sync);
    };
  }, [gameId]);

  if (gameNotFound) {
    return (
      <div className="page" style={{textAlign: "center", padding: "40px 20px"}}>
        <h2>Game not found</h2>
        <p>No game with code {gameId}.</p>
        <Link to="/" className="btn btn-primary">Back to Home</Link>
      </div>
    );
  }

  const allGuessed = entries.length > 0 && entries.every(e => e.guessed);
  const roundOver = started && (allGuessed || turnOrder.length === 0);
  const sortedEntries = started
    ? [...entries].sort((a, b) => a.text.localeCompare(b.text, undefined, {sensitivity: "base"}))
    : [];

  return (
    <div className="spectator-view page" style={{maxWidth: 1200, margin: "0 auto", padding: "24px 20px"}}>
      <header style={{display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(120,120,128,0.2)", paddingBottom: 16, marginBottom: 24}}>
        <div style={{display: "flex", alignItems: "center", gap: 12}}>
          <img src={logo} alt="" width={44} height={44} style={{borderRadius: 10}}/>
          <div>
            <h2 style={{margin: 0, fontSize: "1.5rem"}}>{gameTitle ?? "Game of Things"}</h2>
            <span className="code-pill" style={{marginTop: 4, display: "inline-block"}}>Code: {gameId}</span>
          </div>
        </div>
        <div style={{display: "flex", alignItems: "center", gap: 12}}>
          {wakeLockActive && <span className="footnote" style={{color: "#34c759"}}>● Screen Awake</span>}
          <button type="button" className="btn btn-tinted" onClick={toggleFullscreen}>
            {isFullscreen ? "Exit Fullscreen" : "Fullscreen / TV"}
          </button>
        </div>
      </header>

      {/* Main Question Display */}
      <section className="card" style={{padding: "24px 32px", textAlign: "center", marginBottom: 24}}>
        <span className="footnote" style={{textTransform: "uppercase", letterSpacing: 1, fontWeight: 600}}>
          Question
        </span>
        <h1 style={{fontSize: "2.2rem", margin: "12px 0 0", fontWeight: 700, lineHeight: 1.3}}>
          {question || "Waiting for question..."}
        </h1>
      </section>

      {/* Turn Banner or Pre-Game Status */}
      {!started ? (
        <section className="card stack" style={{textAlign: "center", padding: "40px 20px", marginBottom: 24}}>
          <h2 style={{fontSize: "1.8rem", margin: 0}}>Lobby</h2>
          <p style={{fontSize: "1.2rem", opacity: 0.8, margin: "8px 0 0"}}>
            Waiting for host to start the game.
          </p>
          <div style={{fontSize: "1.4rem", fontWeight: 600, color: "#007aff", marginTop: 12}}>
            {entries.length} {entries.length === 1 ? "answer" : "answers"} submitted so far
          </div>
        </section>
      ) : (
        <section
          className="card turn"
          style={{
            padding: "20px 28px",
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: roundOver ? "rgba(52, 199, 89, 0.15)" : "rgba(0, 122, 255, 0.12)"
          }}
        >
          <div>
            <div style={{fontSize: "1rem", textTransform: "uppercase", fontWeight: 600, opacity: 0.7}}>
              {roundOver ? "Round Over" : "Current Turn"}
            </div>
            <div style={{fontSize: "2rem", fontWeight: 800, marginTop: 4}}>
              {roundOver ? "All answers have been guessed!" : `🎯 ${currentPlayer}'s turn to guess`}
            </div>
          </div>
          {!roundOver && turnOrder.length > 1 && (
            <div style={{fontSize: "1.1rem", textAlign: "right"}}>
              <span style={{opacity: 0.7}}>Up next: </span>
              {turnOrder.slice(1).map((name, i) => (
                <span key={name}>
                  {i > 0 && " → "}
                  <strong>{name}</strong>
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {/* In-Game Content: Answers Grid and Scoreboard */}
      {started && (
        <div style={{display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24}}>
          <section className="stack">
            <h3 style={{margin: 0, fontSize: "1.3rem"}}>Answers ({entries.length})</h3>
            <div style={{display: "flex", flexDirection: "column", gap: 10}}>
              {sortedEntries.map((entry) => (
                <div
                  key={entry.entryId}
                  className="card"
                  style={{
                    padding: "16px 20px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "1.25rem",
                    opacity: entry.guessed ? 0.6 : 1,
                    textDecoration: entry.guessed ? "line-through" : "none"
                  }}
                >
                  <span style={{fontWeight: 500}}>{entry.text}</span>
                  {entry.guessed && (
                    <span
                      style={{
                        fontSize: "0.95rem",
                        fontWeight: 600,
                        padding: "4px 10px",
                        borderRadius: 12,
                        background: "rgba(52, 199, 89, 0.2)",
                        color: "#34c759",
                        textDecoration: "none"
                      }}
                    >
                      ✓ Written by {entry.authorName}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>

          <aside className="stack">
            <h3 style={{margin: 0, fontSize: "1.3rem"}}>Scoreboard</h3>
            <Scoreboard scores={scores}/>
          </aside>
        </div>
      )}
    </div>
  );
}
