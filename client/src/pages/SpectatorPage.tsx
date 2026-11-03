import React, {useState, useEffect, useRef} from "react";
import {Link} from "react-router-dom";
import QRCode from "qrcode";
import {useGameLogic} from "../hooks/useGameLogic";
import Scoreboard from "../components/Scoreboard";
import TopBar from "../components/TopBar";
import QRCodeModal from "../components/QRCodeModal";

export default function SpectatorPage() {
  const {
    gameId,
    gameTitle,
    gameQuestion,
    entries,
    scores,
    turnOrder,
    currentPlayer,
    started,
    answeredNames,
    gameNotFound,
    sortedEntriesForDisplay,
    allGuessed
  } = useGameLogic();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const lobbyQrRef = useRef<HTMLCanvasElement | null>(null);
  const gameUrl = typeof window !== "undefined" && gameId ? `${window.location.origin}/${gameId}` : "";

  const handleCopyCode = async () => {
    if (!gameId) return;
    try {
      await navigator.clipboard.writeText(gameId);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {}
  };

  useEffect(() => {
    if (!started && lobbyQrRef.current && gameUrl) {
      QRCode.toCanvas(lobbyQrRef.current, gameUrl, {
        width: 180,
        margin: 2,
        color: {dark: "#000000", light: "#ffffff"}
      }).catch(() => {});
    }
  }, [started, gameUrl]);

  const roundOver = started && (allGuessed || turnOrder.length === 0);

  // Dynamic document title for Spectator screen
  useEffect(() => {
    const originalTitle = document.title;
    return () => {
      document.title = originalTitle;
    };
  }, []);

  useEffect(() => {
    if (gameNotFound) return;
    if (!started) {
      const count = entries.length;
      document.title = `(Lobby: ${count} ${count === 1 ? "answer" : "answers"}) ${gameTitle || gameId || "Game of Things"}`;
    } else if (roundOver) {
      document.title = `(Round Over) ${gameTitle || gameId || "Game of Things"}`;
    } else if (currentPlayer) {
      document.title = `(${currentPlayer}'s turn) ${gameTitle || gameId || "Game of Things"}`;
    } else {
      document.title = gameTitle || gameId || "Game of Things";
    }
  }, [gameNotFound, started, roundOver, currentPlayer, entries.length, gameTitle, gameId]);

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

  if (gameNotFound) {
    return (
      <div className="page spectator-not-found">
        <h2>Game not found</h2>
        <p>No game with code {gameId}.</p>
        <Link to="/" className="btn btn-primary">Back to Home</Link>
      </div>
    );
  }

  return (
    <div className="spectator-view page">
      <TopBar title={gameTitle || "Game of Things"} />

      <div className="spectator-bar">
        <button
          type="button"
          className="code-pill btn-text"
          onClick={handleCopyCode}
          aria-label={`Game code ${gameId}`}
          style={{cursor: 'pointer', border: 'none'}}
        >
          {copiedCode ? "✓ Copied!" : `Code: ${gameId}`}
        </button>
        <div className="spectator-bar-actions">
          {wakeLockActive && <span className="footnote spectator-awake">● Screen Awake</span>}
          <button type="button" className="btn btn-tinted btn-pill" onClick={() => setShowQRModal(true)} aria-label="Show QR Code">
            QR Code
          </button>
          <button type="button" className="btn btn-tinted btn-pill" onClick={toggleFullscreen}>
            {isFullscreen ? "Exit Fullscreen" : "Fullscreen / TV"}
          </button>
        </div>
      </div>

      {/* Main Question Display */}
      <section className="card spectator-question">
        <span className="footnote spectator-question-label">
          Question
        </span>
        <h1 className="spectator-question-text">
          {gameQuestion || "Waiting for question..."}
        </h1>
      </section>

      {/* Turn Banner or Pre-Game Status */}
      {!started ? (
        <section className="card stack spectator-lobby">
          <h2 className="spectator-lobby-title">Lobby</h2>
          <p className="spectator-lobby-desc">
            Waiting for host to start the game.
          </p>
          <div className="spectator-lobby-count">
            {entries.length} {entries.length === 1 ? "answer" : "answers"} submitted so far
          </div>
          {answeredNames && answeredNames.length > 0 && (
            <div className="footnote" style={{marginTop: 8}} data-testid="spectator-answered-names">
              {`Answers in (${answeredNames.length}): ${answeredNames.join(", ")}`}
            </div>
          )}
          {gameUrl && (
            <div style={{display: "flex", flexDirection: "column", alignItems: "center", marginTop: 16}}>
              <div className="qr-container">
                <canvas ref={lobbyQrRef} data-testid="spectator-lobby-qr" style={{display: "block"}} />
              </div>
              <span className="footnote" style={{marginTop: 6}}>Scan with phone camera to join</span>
            </div>
          )}
        </section>
      ) : (
        <section className={`card turn spectator-turn ${roundOver ? "round-over" : ""}`}>
          <div>
            <div className="spectator-turn-label">
              {roundOver ? "Round Over" : "Current Turn"}
            </div>
            <div className="spectator-turn-player">
              {roundOver ? "All answers have been guessed!" : `🎯 ${currentPlayer}'s turn to guess`}
            </div>
          </div>
          {!roundOver && turnOrder.length > 1 && (
            <div className="spectator-turn-next">
              <span className="spectator-up-next-label">Up next: </span>
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
        <div className="spectator-grid">
          <section className="stack">
            <h3 className="spectator-section-heading">Answers ({entries.length})</h3>
            <div className="spectator-entries-list">
              {sortedEntriesForDisplay.map((entry) => (
                <div
                  key={entry.entryId}
                  className={`card spectator-entry-card ${entry.guessed ? "guessed" : ""}`}
                >
                  <span className="spectator-entry-text">{entry.text}</span>
                  {entry.guessed && (
                    <span className="spectator-entry-badge">
                      ✓ Written by {entry.authorName}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>

          <aside className="stack">
            <h3 className="spectator-section-heading">Scoreboard</h3>
            <Scoreboard scores={scores}/>
          </aside>
        </div>
      )}

      <QRCodeModal
        gameId={gameId || ""}
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
      />
    </div>
  );
}
