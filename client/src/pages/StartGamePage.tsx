import React, {useState, useEffect} from "react";
import {Link} from "react-router-dom";
import {AnimatePresence, motion, useReducedMotion} from "framer-motion";
import logo from "../assets/logo.svg";
import {useGameLogic} from "../hooks/useGameLogic";
import Scoreboard from "../components/Scoreboard";
import TopBar from "../components/TopBar";
import Modal from "../components/Modal";
import Collapse from "../components/Collapse";
import Toast from "../components/Toast";
import QRCodeModal from "../components/QRCodeModal";
import TurnTimer from "../components/TurnTimer";
import {EASE_OUT} from "../components/motion";
import {playTurnSound} from "../audio";
import {Entry} from "../../../types";


export default function StartGamePage() {
  const {
    gameId,
    gameTitle,
    gameQuestion,
    entries,
    scores,
    turnOrder,
    currentPlayer,
    turnEndsAt,
    started,
    answeredNames,
    gameNotFound,
    isHost,
    entryText,
    setEntryText,
    resetCount,
    authorName,
    setAuthorName,
    newQuestion,
    setNewQuestion,
    isLoading,
    addEntryLoading,
    startNewRoundLoading,
    guessLoading,
    guessingEntry,
    setGuessingEntry,
    showStartConfirm,
    setShowStartConfirm,
    showHowToPlay,
    setShowHowToPlay,
    showScores,
    setShowScores,
    toast,
    setToast,
    addEntry,
    editEntry,
    deleteEntry,
    skipTurn,
    removePlayer,
    transferHost,
    startGame,
    startNewRound,
    guessAuthor,
    onEntryClick,
    sortedEntriesForDisplay,
    guessedNames,
    notGuessedNames,
    allGuessed,
    isLastEntry,
    isMyTurn,
    canGuess,
    canPick,
    uniqueNames,
    roundRecap,
    shareableRecapText,
    otherPlayers
  } = useGameLogic();

  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedRecap, setCopiedRecap] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [isChangingName, setIsChangingName] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [showTransferHostModal, setShowTransferHostModal] = useState(false);
  const [transferringHost, setTransferringHost] = useState(false);
  const [timerChoice, setTimerChoice] = useState(0); // Seconds per turn picked in the start dialog; 0 is off.
  const reduceMotion = useReducedMotion();

  // Check if user already submitted for this specific Game ID
  useEffect(() => {
    if (gameId) {
      const alreadySubmitted = localStorage.getItem(`submitted_${gameId}`);
      if (alreadySubmitted === 'true') {
        setHasSubmitted(true);
      }
    }
  }, [gameId]);

  // Reset local state when the backend signals a new round
  useEffect(() => {
    if (resetCount > 0) {
      setHasSubmitted(false);
      setEditingEntryId(null);
      if (gameId) {
        localStorage.removeItem(`submitted_${gameId}`);
      }
    }
  }, [resetCount, gameId]);

  const roundOver = turnOrder.length < 1;
  const inputsLocked = isLoading || addEntryLoading || hasSubmitted;
  const canAdd = !!entryText.trim() && !!authorName.trim() && !inputsLocked;

  // Tab title and vibration/sound for "Your Turn" (#43)
  useEffect(() => {
    const originalTitle = document.title;
    if (isMyTurn && !roundOver && started) {
      document.title = "(Your turn) Game of Things";
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        try { navigator.vibrate(200); } catch {}
      }
      playTurnSound();
    } else {
      document.title = "Game of Things";
    }
    return () => {
      document.title = originalTitle || "Game of Things";
    };
  }, [isMyTurn, roundOver, started]);

  // Wrapper to save to DB AND LocalStorage
  const handleAddEntry = async () => {
    await addEntry();
    setHasSubmitted(true);
    if (gameId) {
      localStorage.setItem(`submitted_${gameId}`, 'true');
    }
    localStorage.setItem("got_name_remembered", "true");
  };

  const handleCopyCode = async () => {
    if (!gameId) return;
    try {
      await navigator.clipboard.writeText(gameId);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {}
  };

  const handleShare = async () => {
    if (typeof window === "undefined" || !gameId) return;
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Game of Things",
          text: `Join my Game of Things game! Code: ${gameId}`,
          url
        });
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setToast({message: "Game link copied to clipboard!", type: "success"});
    } catch {
      handleCopyCode();
    }
  };

  const handleShareRecap = async () => {
    if (!shareableRecapText) return;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "Game of Things Recap",
          text: shareableRecapText
        });
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareableRecapText);
        setCopiedRecap(true);
        setTimeout(() => setCopiedRecap(false), 2000);
      } catch {}
    }
  };

  const handleStartEdit = (entry: Entry) => {
    setEditingEntryId(entry.entryId);
    setEditText(entry.text ?? "");
  };

  const handleSaveEdit = async (entryId: string) => {
    if (!editText.trim()) return;
    setEditLoading(true);
    const ok = await editEntry(entryId, editText.trim());
    if (ok) setEditingEntryId(null);
    setEditLoading(false);
  };

  const handleRemoveSubmission = async (entryId: string) => {
    const ok = await deleteEntry(entryId);
    if (ok) {
      setHasSubmitted(false);
      if (gameId) localStorage.removeItem(`submitted_${gameId}`);
    }
  };

  const handleStartNewRound = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim() || startNewRoundLoading) return;
    startNewRound();
  };

  const hasRememberedName = Boolean(
    authorName &&
    typeof window !== 'undefined' &&
    window.localStorage.getItem("got_name_remembered") === "true"
  );

  if (gameNotFound) {
    return (
        <div className="page">
          <TopBar>
            <Link to="/" className="topbar-title">‹ Home</Link>
          </TopBar>
          <div className="game-header">
            <h2>Game not found</h2>
            <p>There's no game with the code {gameId}. Check the code and try again.</p>
            <Link to="/" className="btn btn-primary">Back to Home</Link>
          </div>
        </div>
    );
  }

  return (
      <div className="page">
        <TopBar>
          <Link to="/" className="topbar-title">‹ Home</Link>
        </TopBar>

        {/* Header */}
        <div className="game-header">
          <Link to="/"><img src={logo} alt="Game of Things" className="app-icon" width={64} height={64}/></Link>
          <h2 style={{marginTop: 8}}>{gameTitle ?? gameId}</h2>
          {gameId && (
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap'}}>
              <button
                type="button"
                className="code-pill btn-text"
                onClick={handleCopyCode}
                aria-label={`Game code ${gameId}`}
                style={{cursor: 'pointer', border: 'none'}}
              >
                {copiedCode ? "✓ Copied!" : gameId}
              </button>
              <button
                type="button"
                className="btn btn-tinted btn-pill"
                onClick={handleShare}
                aria-label="Share game link"
              >
                Share
              </button>
              <button
                type="button"
                className="btn btn-tinted btn-pill"
                onClick={() => setShowQRModal(true)}
                aria-label="Show QR code"
              >
                QR Code
              </button>
              <Link
                to={`/${gameId}/watch`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-gray btn-pill"
                aria-label="Watch on a screen"
              >
                Watch on a screen
              </Link>
              {isHost && otherPlayers.length > 0 && (
                <button
                  type="button"
                  className="btn btn-tinted btn-pill"
                  onClick={() => setShowTransferHostModal(true)}
                  aria-label="Transfer Host"
                >
                  Transfer Host
                </button>
              )}
            </div>
          )}
          <p className="question" style={{marginTop: 8, minHeight: 29}}>
            {gameQuestion ? gameQuestion : <span style={{opacity: 0.4}}>Loading question...</span>}
          </p>
        </div>

        {/* Turn Indicator */}
        {(turnOrder.length > 0 || started) && (
            <motion.div
                key={`turn-${currentPlayer}`}
                className={`turn${roundOver ? " done" : ""}`}
                initial={{opacity: 0, scale: 0.96}} animate={{opacity: 1, scale: 1}}
                transition={{type: "spring", bounce: 0, duration: 0.4}}
            >
              {roundOver
                  ? <motion.span className="turn-dot" aria-hidden="true"
                                 initial={{scale: 0.8}} animate={{scale: 1}}
                                 transition={{type: "spring", duration: 0.5, bounce: 0.25}}>✓</motion.span>
                  : <span className="turn-dot" aria-hidden="true">➜</span>}
              <div style={{flex: 1}}>
                <div className="turn-eyebrow">{roundOver ? "Round over" : isMyTurn ? "Your turn" : "Now guessing"}</div>
                <div className="turn-name">{roundOver ? "All answers guessed!" : `${currentPlayer}'s turn!`}</div>
                {!roundOver && (
                  <TurnTimer endsAt={turnEndsAt}
                             hurry={isMyTurn ? "Time's up, hurry up!" : `Time's up. Hurry up, ${currentPlayer}!`}/>
                )}
                {!roundOver && turnOrder.length > 1 && (
                  <div className="up-next" style={{fontSize: 13, marginTop: 4, opacity: 0.8}}>
                    <span>Up next: </span>
                    {turnOrder.slice(1).map((p, idx) => (
                      <span key={p}>
                        {idx > 0 && " → "}
                        <strong>{p}</strong>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {started && isHost && !roundOver && (
                <button
                  type="button"
                  className="btn btn-tinted"
                  style={{fontSize: 13, padding: '4px 8px', alignSelf: 'center'}}
                  onClick={skipTurn}
                  aria-label="Skip turn"
                >
                  Skip
                </button>
              )}
            </motion.div>
        )}

        {/* Game Status */}
        {started && (
            <dl className="card stats" style={{margin: 0}}>
              <div>
                <dt>Already guessed</dt>
                <dd>{guessedNames.length ? guessedNames.join(", ") : "No one yet"}</dd>
              </div>
              <div>
                <dt>Players left</dt>
                <dd>{turnOrder.length}</dd>
              </div>
              <div className="full">
                <dt>Not yet guessed</dt>
                <dd>{notGuessedNames.length ? notGuessedNames.join(", ") : "Everyone has been guessed!"}</dd>
              </div>
            </dl>
        )}
        {started && isHost && !roundOver && turnOrder.length > 1 && (
          <div style={{display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, padding: '4px 8px'}}>
            <span style={{opacity: 0.7}}>Remove player:</span>
            {turnOrder.map(name => (
              <button
                key={name}
                type="button"
                className="btn-text btn-destructive"
                style={{color: '#ff3b30', fontSize: 12, padding: '2px 6px'}}
                onClick={() => removePlayer(name)}
                aria-label={`Remove player ${name}`}
              >
                {name} ✕
              </button>
            ))}
          </div>
        )}

        {/* Input Section (Pre-Game) */}
        {!started && (
            <form onSubmit={e => { e.preventDefault(); handleAddEntry(); }} className="stack">
              <input
                  value={entryText}
                  onChange={e => setEntryText(e.target.value)}
                  placeholder="Your answer"
                  aria-label="Your answer"
                  maxLength={200}
                  disabled={inputsLocked}
              />
              {hasRememberedName && !isChangingName && !hasSubmitted ? (
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(120,120,128,0.1)', borderRadius: 10}}>
                  <span>Playing as <strong>{authorName}</strong></span>
                  <button type="button" className="btn-text" onClick={() => setIsChangingName(true)} disabled={inputsLocked}>
                    change
                  </button>
                </div>
              ) : null}
              <input
                  value={authorName}
                  onChange={e => setAuthorName(e.target.value)}
                  placeholder="Your name"
                  aria-label="Your name"
                  maxLength={30}
                  disabled={inputsLocked}
                  style={hasRememberedName && !isChangingName && !hasSubmitted ? {display: 'none'} : undefined}
              />
              <div className="row">
                <button type="submit" className="btn btn-primary" disabled={!canAdd}>
                  {addEntryLoading ? <><span className="spinner"/>Saving...</> : hasSubmitted ? 'Submitted!' : 'Add Answer'}
                </button>
                {isHost && (
                    <button type="button" className="btn btn-success" onClick={() => setShowStartConfirm(true)}
                            disabled={!entries.length || started || isLoading}>
                      {isLoading ? <><span className="spinner"/>Starting...</> : 'Start'}
                    </button>
                )}
              </div>
              {!isHost && <p className="footnote">Waiting for the host to start the game.</p>}
            </form>
        )}

        {/* New Round (End Game) */}
        {allGuessed && isHost && (
            <section className="stack">
              <h4 className="section-label">Next Round</h4>
              <form onSubmit={handleStartNewRound} className="stack">
                <input type="text" placeholder="Game Over! Ask a new question?" value={newQuestion}
                       onChange={e => setNewQuestion(e.target.value)} disabled={startNewRoundLoading}
                       aria-label="New question"/>
                <button type="submit" className="btn btn-success btn-block" disabled={!newQuestion.trim() || startNewRoundLoading}>
                  {startNewRoundLoading ? <><span className="spinner"/>Starting...</> : "Start New Round"}
                </button>
              </form>
              <p className="footnote" style={{paddingLeft: 16}}>The player who has gone the longest ago goes first.</p>
            </section>
        )}

        {/* Answers List */}
        <section>
          <h4 className="section-label">{started ? "Your Group's Answers" : `Answers (${entries.length})`}</h4>
          <ul className="list">
            {sortedEntriesForDisplay.length === 0 && <li className="footnote">No entries yet</li>}
            {!started && answeredNames.length > 0 && (
              <li className="footnote" data-testid="answered-names">
                {`Answers in (${answeredNames.length}): ${answeredNames.join(", ")}`}
              </li>
            )}
            {sortedEntriesForDisplay.filter(entry => started || entry.mine).map((entry, index) => (
                // Keyed by `started` so every answer remounts and plays its reveal when the round starts.
                // Staggered (capped, so a big group doesn't wait long); no stagger under reduced motion.
                <motion.li key={`${entry.entryId}-${started}`} className={started ? "answer-row" : undefined}
                           initial={started ? {opacity: 0, y: 12, scale: 0.97} : {opacity: 0, y: 8}}
                           animate={{opacity: 1, y: 0, scale: 1}}
                           transition={{
                             type: "spring", bounce: 0, duration: 0.3,
                             delay: started && !reduceMotion ? Math.min(index, 8) * 0.06 : 0
                           }}>
                  {started ? (
                      <button
                          className={`answer${entry.guessed ? " guessed" : ""}`}
                          disabled={!canGuess(entry)}
                          onClick={() => onEntryClick(entry)}
                      >
                        <span>{entry.text}</span>
                        <AnimatePresence initial={false} mode="popLayout">
                          {entry.guessed
                              ? <motion.span key="author" className="answer-author"
                                             initial={{opacity: 0, x: 6}} animate={{opacity: 1, x: 0}}
                                             transition={{duration: 0.15, ease: EASE_OUT}}>{entry.authorName}</motion.span>
                              : <motion.span key="chevron" className="chevron" aria-hidden="true"
                                             exit={{opacity: 0}} transition={{duration: 0.15, ease: EASE_OUT}}>›</motion.span>}
                        </AnimatePresence>
                      </button>
                  ) : entry.mine ? (
                      // PRE-GAME: my own entry is visible to me only
                      <div className="my-submission" style={{width: '100%'}}>
                        {editingEntryId === entry.entryId ? (
                          <div className="stack" style={{gap: 6}}>
                            <input
                              value={editText}
                              onChange={e => setEditText(e.target.value)}
                              aria-label="Edit answer"
                              maxLength={200}
                              disabled={editLoading}
                            />
                            <div className="row" style={{gap: 6}}>
                              <button
                                type="button"
                                className="btn btn-primary"
                                disabled={!editText.trim() || editLoading}
                                onClick={() => handleSaveEdit(entry.entryId)}
                              >
                                {editLoading ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-gray"
                                onClick={() => setEditingEntryId(null)}
                                disabled={editLoading}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="mine">{entry.text}</div>
                            <div className="footnote" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4}}>
                              <span>Your submission, not viewable to others yet</span>
                              <span style={{display: 'flex', gap: 10}}>
                                <button
                                  type="button"
                                  className="btn-text"
                                  onClick={() => handleStartEdit(entry)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn-text btn-destructive"
                                  style={{color: '#ff3b30'}}
                                  onClick={() => handleRemoveSubmission(entry.entryId)}
                                >
                                  Remove
                                </button>
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                  ) : null}
                </motion.li>
            ))}
          </ul>
        </section>

        {/* End of Round Recap */}
        {allGuessed && roundRecap && (
          <section className="card stack" style={{background: 'rgba(52, 199, 89, 0.1)', border: '1px solid rgba(52, 199, 89, 0.3)'}}>
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
              <h4 style={{margin: 0, color: '#34c759'}}>Round Recap</h4>
              <button
                type="button"
                className="btn btn-tinted btn-pill"
                onClick={handleShareRecap}
                aria-label="Share recap"
              >
                {copiedRecap ? "✓ Copied!" : "Share Recap"}
              </button>
            </div>
            <div style={{fontSize: 15}}>
              <div><strong>Most guesses this round:</strong> {roundRecap.mostGuessesRound}</div>
              <div style={{marginTop: 4}}><strong>Overall leader:</strong> {roundRecap.overallLeader}</div>
            </div>
          </section>
        )}

        {/* Scoreboard */}
        {scores.length > 0 && (
            <div className="stack" style={{gap: 4}}>
              <button className="btn-text" style={{alignSelf: "flex-end"}}
                      onClick={() => setShowScores(prev => !prev)}>
                {showScores ? "Hide scoreboard" : "Show scoreboard"}
              </button>
              <AnimatePresence initial={false}>
                {showScores && <Collapse key="scores"><Scoreboard scores={scores}/></Collapse>}
              </AnimatePresence>
            </div>
        )}

        {/* How To Play */}
        <section>
          <button className="btn-text" onClick={() => setShowHowToPlay(prev => !prev)} aria-expanded={showHowToPlay}>
            {showHowToPlay ? "Hide how to play" : "How to play"}
          </button>
          <AnimatePresence initial={false}>
          {showHowToPlay && (
              <Collapse key="how">
              <div className="card stack footnote" style={{marginTop: 8, fontSize: 15}}>
                <p>
                  Each person secretly writes an answer to the question and adds it to the list.
                </p>
                <p>
                  When the host starts the game, all answers are revealed. Taking turns, tap an
                  answer and then choose who you think wrote it. If you're right, you go again!
                </p>
                <p>
                  Correct guesses mark that person as guessed. Keep going until everyone has
                  been guessed. Once you're the last remaining player, you can guess yourself for a
                  free point to end the game. Then, ask a new question and start a new round—the
                  player who has gone the longest ago goes first.
                </p>
              </div>
              </Collapse>
          )}
          </AnimatePresence>
        </section>

        {/* Guess Modal */}
        <AnimatePresence>
        {guessingEntry && (
            <Modal key="guess" onClose={() => setGuessingEntry(null)} role="dialog" labelledBy="guess-title">
                <h3 id="guess-title">Who wrote this?</h3>
                <p>“{guessingEntry.text}”</p>
                <div className="stack">
                  {uniqueNames.map(name => {
                    return (
                        <button key={name} className="btn btn-tinted btn-block"
                                disabled={!canPick(name) || guessLoading}
                                onClick={() => guessAuthor(guessingEntry.entryId, name)}>
                          {name}
                        </button>
                    );
                  })}
                  {guessLoading && (
                      <div className="footnote" style={{display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 8}}>
                        <span className="spinner"/>Guessing...
                      </div>
                  )}
                  <button className="btn btn-gray btn-block" onClick={() => setGuessingEntry(null)}>Cancel</button>
                </div>
            </Modal>
        )}
        </AnimatePresence>

        {/* Start Confirmation Modal */}
        <AnimatePresence>
        {showStartConfirm && (
            <Modal key="start" onClose={() => setShowStartConfirm(false)} role="alertdialog" labelledBy="start-title">
                <h3 id="start-title">Is everyone ready?</h3>
                <p>Once you press Start, answers are revealed.</p>
                <label className="timer-choice">
                  Turn timer
                  <select value={timerChoice} onChange={e => setTimerChoice(Number(e.target.value))}>
                    <option value={0}>Off</option>
                    <option value={30}>30 seconds</option>
                    <option value={60}>1 minute</option>
                    <option value={90}>1 minute 30</option>
                    <option value={120}>2 minutes</option>
                  </select>
                </label>
                <div className="stack">
                  <button className="btn btn-success btn-block" onClick={() => {
                    setShowStartConfirm(false);
                    startGame(timerChoice || undefined);
                  }}>Yes, Start Game!
                  </button>
                  <button className="btn btn-gray btn-block" onClick={() => setShowStartConfirm(false)}>
                    Wait, Not Yet
                  </button>
                </div>
            </Modal>
        )}
        </AnimatePresence>

        {/* Transfer Host Modal */}
        <AnimatePresence>
        {showTransferHostModal && (
            <Modal key="transfer-host" role="dialog" onClose={() => setShowTransferHostModal(false)} labelledBy="transfer-host-title">
                <h3 id="transfer-host-title">Transfer Host</h3>
                <p className="footnote" style={{marginBottom: 16}}>
                  Select a player to become the new host.
                </p>
                <div className="stack" style={{maxHeight: 240, overflowY: 'auto'}}>
                  {otherPlayers.map(player => (
                    <button
                      key={player}
                      type="button"
                      className="btn btn-tinted btn-block"
                      disabled={transferringHost}
                      onClick={async () => {
                        setTransferringHost(true);
                        const success = await transferHost(player);
                        setTransferringHost(false);
                        if (success) {
                          setShowTransferHostModal(false);
                        }
                      }}
                    >
                      {transferringHost ? 'Transferring...' : player}
                    </button>
                  ))}
                </div>
                <div className="row" style={{marginTop: 16}}>
                  <button
                    type="button"
                    className="btn btn-gray btn-block"
                    disabled={transferringHost}
                    onClick={() => setShowTransferHostModal(false)}
                  >
                    Cancel
                  </button>
                </div>
            </Modal>
        )}
        </AnimatePresence>

        {/* Toast */}
        <AnimatePresence>
        {toast && <Toast key="toast" message={toast.message} type={toast.type}/>}
        </AnimatePresence>

        <QRCodeModal
          gameId={gameId || ""}
          isOpen={showQRModal}
          onClose={() => setShowQRModal(false)}
        />
      </div>
  );
}
