import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import logo from "../../src/assets/logo.jpg";
import { useGameLogic } from "../hooks/useGameLogic";
import Scoreboard from "../components/Scoreboard";

export default function StartGamePage() {
  const {
    gameId, gameTitle, gameQuestion, entries, scores, turnOrder, currentPlayer, started,
    entryText, setEntryText, authorName, setAuthorName, newQuestion, setNewQuestion,
    isLoading, addEntryLoading, startNewRoundLoading, guessLoading,
    guessingEntry, setGuessingEntry, showStartConfirm, setShowStartConfirm,
    showHowToPlay, setShowHowToPlay, showScores, setShowScores, buttonRefs, toast,
    addEntry, startGame, startNewRound, guessAuthor, onEntryClick,
    sortedEntriesForDisplay, guessedNames, notGuessedNames, allGuessed, isLastEntry, isMyTurn, uniqueNames
  } = useGameLogic();

  return (
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <Link to="/"><img src={logo} alt="Game of Things" style={{ width: 80 }} /></Link>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 12, marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>{gameTitle ?? gameId}</h2>
          {gameId && <span style={{ color: "#3c3c4399", fontSize: 14 }}>(ID: {gameId})</span>}
        </div>
        {gameQuestion && <p style={{ fontSize: 18, marginBottom: 20 }}>{gameQuestion}</p>}

        {/* Scoreboard Toggle */}
        {scores.length > 0 && (
            <div style={{ maxWidth: 600, margin: "0 auto 12px auto", display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setShowScores(prev => !prev)}
                      style={{ border: "none", background: "transparent", color: "#007aff", fontSize: 14, cursor: "pointer", textDecoration: "underline" }}>
                {showScores ? "Hide scoreboard" : "Show scoreboard"}
              </button>
            </div>
        )}
        {scores.length > 0 && showScores && <Scoreboard scores={scores} />}

        {/* Game Status */}
        {started && (
            <div style={{ marginBottom: 20, padding: "10px 14px", borderRadius: 12, backgroundColor: "#f2f2f7", fontSize: 14, textAlign: "left", maxWidth: 600, marginInline: "auto" }}>
              <div style={{ marginBottom: 6 }}><strong>Already guessed:</strong> {guessedNames.length ? guessedNames.join(", ") : "No one yet"}</div>
              <div style={{ marginBottom: 6 }}><strong>Not yet guessed:</strong> {notGuessedNames.length ? notGuessedNames.join(", ") : "Everyone has been guessed!"}</div>
              <div><strong>Players Left:</strong> {turnOrder.length}</div>
            </div>
        )}

        {/* Input Section (Pre-Game) */}
        {!started && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', marginTop: 16 }}>
              <input value={entryText} onChange={e => setEntryText(e.target.value)} placeholder="Your answer"
                     disabled={isLoading || addEntryLoading} style={{ width: '100%', maxWidth: 400, padding: '12px 16px', fontSize: 16, borderRadius: 12, border: '1px solid #d1d1d6' }} />

              <input value={authorName} onChange={e => setAuthorName(e.target.value)} placeholder="Your name"
                     disabled={isLoading || addEntryLoading} style={{ width: '100%', maxWidth: 400, padding: '12px 16px', fontSize: 16, borderRadius: 12, border: '1px solid #d1d1d6' }} />

              <div style={{ display: 'flex', gap: 16, width: '100%', maxWidth: 400, justifyContent: 'center' }}>
                <button onClick={addEntry} disabled={isLoading || addEntryLoading || !entryText || !authorName}
                        style={{
                          flex: 1, maxWidth: 140, padding: '14px 24px', borderRadius: 12, border: 'none', fontWeight: 600, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          background: (entryText && authorName && !addEntryLoading) ? '#007aff' : '#c7c7cc',
                          color: 'white', cursor: (entryText && authorName && !addEntryLoading) ? 'pointer' : 'not-allowed'
                        }}>
                  {addEntryLoading ? (
                      <>
                        <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.5)', borderTopColor: 'white', animation: 'spin 1s linear infinite' }} />
                        Saving...
                      </>
                  ) : 'Add Answer'}
                </button>

                <button onClick={() => setShowStartConfirm(true)} disabled={!entries.length || started || isLoading}
                        style={{
                          flex: 1, maxWidth: 140, padding: '14px 24px', borderRadius: 12, border: 'none', fontWeight: 600, fontSize: 16,
                          background: entries.length && !started && !isLoading ? '#34c759' : '#c7c7cc',
                          color: 'white', cursor: isLoading ? 'not-allowed' : 'pointer'
                        }}>
                  {isLoading ? (
                      <>
                        <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.5)', borderTopColor: 'white', animation: 'spin 1s linear infinite', marginRight: 8 }} />
                        Starting...
                      </>
                  ) : 'Start'}
                </button>
              </div>
            </div>
        )}

        {/* Turn Indicator */}
        {(turnOrder.length > 0 || started) && (
            <div className="flex items-center justify-center gap-4 p-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl shadow-2xl mb-6">
              <motion.div key={`arrow-${currentPlayer}`} initial={{ rotate: -180 }} animate={{ rotate: 0 }} transition={{ duration: 0.5, ease: "easeOut" }} className="text-4xl">➡️</motion.div>
              <div className="text-center">
                <h2 className="text-2xl font-bold text-white drop-shadow-lg">{turnOrder.length >= 1 ? `${currentPlayer}'s turn!` : "All answers guessed!"}</h2>
              </div>
            </div>
        )}

        {/* New Round (End Game) */}
        {allGuessed && (
            <div style={{ marginTop: 30 }}>
              <input type="text" placeholder="Game Over! Ask a new question?" value={newQuestion} onChange={e => setNewQuestion(e.target.value)} disabled={startNewRoundLoading}
                     style={{ padding: "12px 16px", fontSize: 16, width: "70%", borderRadius: 12, border: "1px solid #d1d1d6", marginRight: 12 }} />
              <button disabled={!newQuestion.trim() || startNewRoundLoading} onClick={startNewRound}
                      style={{
                        background: startNewRoundLoading || !newQuestion.trim() ? "#c7c7cc" : "#34c759", color: "white",
                        padding: "12px 16px", borderRadius: 12, border: "none", fontWeight: 600, cursor: startNewRoundLoading ? "not-allowed" : "pointer"
                      }}>
                {startNewRoundLoading ? (
                    <>
                      <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.5)', borderTopColor: 'white', animation: 'spin 1s linear infinite', marginRight: 8 }} />
                      Starting...
                    </>
                ) : "Start New Round"}
              </button>
            </div>
        )}

        {/* Answers List */}
        <ul>
          {started && <p style={{ marginBottom: 12, fontWeight: 600, color: "#1d1d1f" }}>Your Group's Answers:</p>}
          {sortedEntriesForDisplay.length === 0 && <li>No entries found</li>}
          {sortedEntriesForDisplay.map(entry => (
              <motion.li key={entry.entryId} style={{ margin: "10px 0" }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                {started ? (
                    <button ref={el => { buttonRefs.current[entry.entryId] = el; }}
                            disabled={!isMyTurn || entry.guessed || (entry.authorName === authorName && !isLastEntry)}
                            onClick={() => onEntryClick(entry)}>
                      {entry.text}
                    </button>
                ) : (
                    <span style={{ filter: "blur(6px)", color: "rgba(0,0,0,0.6)", userSelect: "none", textShadow: "0 0 2px rgba(0,0,0,0.1)" }}>{entry.text}</span>
                )}
              </motion.li>
          ))}
        </ul>

        {/* Guess Modal */}
        {guessingEntry && (
            <div className="guess-overlay" onClick={() => setGuessingEntry(null)}>
              <div className="guess-modal" onClick={e => e.stopPropagation()}>
                <h4>Who wrote this?</h4>
                <div className="guess-list">
                  <ul>
                    {uniqueNames.map(name => {
                      const disabled = entries.filter(e => e.authorName === name).every(e => e.guessed);
                      return (
                          <li key={name}>
                            <button disabled={disabled || !guessingEntry || guessLoading}
                                    onClick={() => { if (guessingEntry && !disabled && !guessLoading) guessAuthor(guessingEntry.entryId, name); }}
                                    style={{ width: "75%", padding: "12px 14px", borderRadius: 12, border: "none", textAlign: "center", marginBottom: 8,
                                      backgroundColor: disabled || guessLoading ? "#e5e5ea" : "#007aff", color: disabled || guessLoading ? "#8e8e93" : "white",
                                      cursor: disabled || guessLoading ? "default" : "pointer" }}>
                              {name}
                            </button>
                          </li>
                      )
                    })}
                  </ul>
                </div>

                {/* Restored Loading Spinner */}
                {guessLoading && (
                    <div style={{
                      marginTop: 16, fontSize: 15, fontWeight: 600, color: "#007aff",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                    }}>
                <span style={{
                  width: 18, height: 18, borderRadius: "50%",
                  border: "2px solid rgba(0,122,255,0.3)", borderTopColor: "#007aff",
                  animation: "spin 0.9s linear infinite"
                }} />
                      Guessing...
                    </div>
                )}

                <button className="cancel-button" onClick={() => setGuessingEntry(null)}>Cancel</button>
              </div>
            </div>
        )}

        {/* Start Confirmation Modal */}
        {showStartConfirm && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
              <div style={{ background: 'white', borderRadius: 20, padding: 32, maxWidth: 400, textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 24, fontWeight: 600 }}>👥 Is everyone ready?</h3>
                <p style={{ margin: '0 0 32px', color: '#3c3c43' }}>Once you press Start, answers are revealed. Refresh your screens!</p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                  <button onClick={() => { setShowStartConfirm(false); startGame(); }} style={{ flex: 1, background: '#34c759', color: 'white', padding: '14px 24px', borderRadius: 12, border: 'none', fontWeight: 600 }}>Yes, Start Game!</button>
                  <button onClick={() => setShowStartConfirm(false)} style={{ flex: 1, background: '#f2f2f7', color: '#007aff', padding: '14px 24px', borderRadius: 12, border: 'none', fontWeight: 600 }}>Wait, Not Yet</button>
                </div>
              </div>
            </div>
        )}

        {/* How To Play & Toast */}
        <div style={{ maxWidth: 600, margin: "24px auto 0 auto", display: "flex", justifyContent: "flex-start", gap: 8 }}>
          <button onClick={() => setShowHowToPlay(prev => !prev)} style={{ width: 28, height: 28, borderRadius: "50%", border: "none", backgroundColor: "#e5e5ea", color: "#007aff", fontWeight: 700 }}>i</button>
        </div>
        {showHowToPlay && (
            <div style={{ maxWidth: 600, margin: "8px auto 20px auto", padding: "12px 16px", borderRadius: 12, backgroundColor: "#f2f2f7", fontSize: 14, textAlign: "left" }}>
              <p>Each person secretly writes an answer. Reveal them, then guess who wrote what!</p>
            </div>
        )}
        {toast && (
            <div style={{ position: 'fixed', top: '20px', left: 0, width: '100%', display: 'flex', justifyContent: 'center', zIndex: 2000, pointerEvents: 'none' }}>
              <div style={{ backgroundColor: toast.type === 'success' ? '#34c759' : '#ff3b30', color: 'white', padding: '12px 20px', borderRadius: '12px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', fontWeight: 600, pointerEvents: 'auto' }}>
                {toast.message}
              </div>
            </div>
        )}
      </div>
  );
}
