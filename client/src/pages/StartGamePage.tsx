import React, {useState, useEffect} from "react";
import {Link} from "react-router-dom";
import {AnimatePresence, motion} from "framer-motion";
import logo from "../assets/logo.jpg";
import {useGameLogic} from "../hooks/useGameLogic";
import Scoreboard from "../components/Scoreboard";
import TopBar from "../components/TopBar";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

// Expand/collapse wrapper shared by the scoreboard and how-to-play sections.
function Collapse({children}: {children: React.ReactNode}) {
  return (
      <motion.div style={{overflow: "hidden"}}
                  initial={{height: 0, opacity: 0}} animate={{height: "auto", opacity: 1}}
                  exit={{height: 0, opacity: 0}}
                  transition={{duration: 0.22, ease: EASE_IN_OUT}}>
        {children}
      </motion.div>
  );
}

// Overlay + dialog with matching enter/exit; children are the dialog body.
function Modal({onClose, role, labelledBy, children}: {
  onClose: () => void; role: "dialog" | "alertdialog"; labelledBy: string; children: React.ReactNode;
}) {
  return (
      <motion.div className="overlay" onClick={onClose}
                  initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}}
                  transition={{duration: 0.15, ease: EASE_OUT}}>
        <motion.div className="dialog" role={role} aria-modal="true" aria-labelledby={labelledBy}
                    onClick={e => e.stopPropagation()}
                    initial={{opacity: 0, scale: 1.08}} animate={{opacity: 1, scale: 1}}
                    exit={{opacity: 0, scale: 0.96}}
                    transition={{duration: 0.2, ease: EASE_OUT}}>
          {children}
        </motion.div>
      </motion.div>
  );
}

export default function StartGamePage() {
  const {
    gameId,
    gameTitle,
    gameQuestion,
    entries,
    scores,
    turnOrder,
    currentPlayer,
    started,
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
    buttonRefs,
    toast,
    addEntry,
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
    uniqueNames
  } = useGameLogic();

  const [hasSubmitted, setHasSubmitted] = useState(false);

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
      if (gameId) {
        localStorage.removeItem(`submitted_${gameId}`);
      }
    }
  }, [resetCount, gameId]);

  // Wrapper to save to DB AND LocalStorage
  const handleAddEntry = async () => {
    // 1. Call the original hook function
    await addEntry();

    // 2. Lock the UI
    setHasSubmitted(true);
    if (gameId) {
      localStorage.setItem(`submitted_${gameId}`, 'true');
    }
  };

  const roundOver = turnOrder.length < 1;
  const inputsLocked = isLoading || addEntryLoading || hasSubmitted;
  const canAdd = !!entryText && !!authorName && !inputsLocked;

  return (
      <div className="page">
        <TopBar>
          <Link to="/" className="topbar-title">‹ Home</Link>
        </TopBar>

        {/* Header */}
        <div className="game-header">
          <Link to="/"><img src={logo} alt="Game of Things" className="app-icon" width={64} height={64}/></Link>
          <h2 style={{marginTop: 8}}>{gameTitle ?? gameId}</h2>
          {gameId && <span className="code-pill" aria-label={`Game code ${gameId}`}>{gameId}</span>}
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
              <div>
                <div className="turn-eyebrow">{roundOver ? "Round over" : isMyTurn ? "Your turn" : "Now guessing"}</div>
                <div className="turn-name">{roundOver ? "All answers guessed!" : `${currentPlayer}'s turn!`}</div>
              </div>
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

        {/* Input Section (Pre-Game) */}
        {!started && (
            <section className="stack">
              <input
                  value={entryText}
                  onChange={e => setEntryText(e.target.value)}
                  placeholder="Your answer"
                  disabled={inputsLocked}
              />
              <input
                  value={authorName}
                  onChange={e => setAuthorName(e.target.value)}
                  placeholder="Your name"
                  disabled={inputsLocked}
              />
              <div className="row">
                <button className="btn btn-primary" onClick={handleAddEntry} disabled={!canAdd}>
                  {addEntryLoading ? <><span className="spinner"/>Saving...</> : hasSubmitted ? 'Submitted!' : 'Add Answer'}
                </button>
                <button className="btn btn-success" onClick={() => setShowStartConfirm(true)}
                        disabled={!entries.length || started || isLoading}>
                  {isLoading ? <><span className="spinner"/>Starting...</> : 'Start'}
                </button>
              </div>
            </section>
        )}

        {/* New Round (End Game) */}
        {allGuessed && (
            <section className="stack">
              <h4 className="section-label">Next Round</h4>
              <input type="text" placeholder="Game Over! Ask a new question?" value={newQuestion}
                     onChange={e => setNewQuestion(e.target.value)} disabled={startNewRoundLoading}/>
              <button className="btn btn-success btn-block" disabled={!newQuestion.trim() || startNewRoundLoading}
                      onClick={startNewRound}>
                {startNewRoundLoading ? <><span className="spinner"/>Starting...</> : "Start New Round"}
              </button>
              <p className="footnote" style={{paddingLeft: 16}}>The player who has gone the longest ago goes first.</p>
            </section>
        )}

        {/* Answers List */}
        <section>
          <h4 className="section-label">{started ? "Your Group's Answers" : `Answers (${entries.length})`}</h4>
          <ul className="list">
            {sortedEntriesForDisplay.length === 0 && <li className="footnote">No entries yet</li>}
            {sortedEntriesForDisplay.map(entry => (
                <motion.li key={entry.entryId} className={started ? "answer-row" : undefined}
                           initial={{opacity: 0, y: 8}} animate={{opacity: 1, y: 0}}
                           transition={{type: "spring", bounce: 0, duration: 0.3}}>
                  {started ? (
                      <button
                          ref={el => {
                            buttonRefs.current[entry.entryId] = el;
                          }}
                          className={`answer${entry.guessed ? " guessed" : ""}`}
                          disabled={!isMyTurn || entry.guessed || (entry.authorName === authorName && !isLastEntry)}
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
                  ) : entry.authorName === authorName ? (
                      // PRE-GAME: my own entry is visible to me only
                      <div>
                        <div className="mine">{entry.text}</div>
                        <div className="footnote">Your submission, not viewable to others yet</div>
                      </div>
                  ) : (
                      // PRE-GAME: everyone else's entry is blurred
                      <span className="hidden-answer" aria-label="Hidden answer">{entry.text}</span>
                  )}
                </motion.li>
            ))}
          </ul>
        </section>

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
                    const disabled = entries.filter(e => e.authorName === name).every(e => e.guessed);
                    return (
                        <button key={name} className="btn btn-tinted btn-block"
                                disabled={disabled || guessLoading}
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
                <p>Once you press Start, answers are revealed. Refresh your screens!</p>
                <div className="stack">
                  <button className="btn btn-success btn-block" onClick={() => {
                    setShowStartConfirm(false);
                    startGame();
                  }}>Yes, Start Game!
                  </button>
                  <button className="btn btn-gray btn-block" onClick={() => setShowStartConfirm(false)}>
                    Wait, Not Yet
                  </button>
                </div>
            </Modal>
        )}
        </AnimatePresence>

        {/* Toast */}
        <AnimatePresence>
        {toast && (
            <motion.div key="toast" className="toast-wrap" role="status" aria-live="polite"
                        initial={{opacity: 0, y: "-100%"}} animate={{opacity: 1, y: 0}}
                        exit={{opacity: 0, y: "-100%"}}
                        transition={{duration: 0.25, ease: EASE_OUT}}>
              <div className={`toast ${toast.type}`}>
                <span className="toast-dot" aria-hidden="true"/>
                {toast.message}
              </div>
            </motion.div>
        )}
        </AnimatePresence>
      </div>
  );
}
