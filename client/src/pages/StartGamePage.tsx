import React, {useState, useEffect} from "react";
import {Link} from "react-router-dom";
import {motion} from "framer-motion";
import logo from "../assets/logo.jpg";
import {useGameLogic} from "../hooks/useGameLogic";
import Scoreboard from "../components/Scoreboard";
import {useDarkMode} from "../hooks/useDarkMode";

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

  const {isDark, toggleTheme} = useDarkMode();
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

  return (
      <div style={{textAlign: "center", marginBottom: 20}}>

        {/* --- NEW HEADER ROW FOR DARK MODE --- */}
        <div style={{
          display: "flex",
          justifyContent: "flex-end",
          maxWidth: 700,     /* Match your #root width */
          margin: "0 auto",  /* Center the container */
          paddingRight: 10   /* Small buffer from edge */
        }}>
          <button
              onClick={toggleTheme}
              style={{
                background: "transparent",
                border: "1px solid var(--border-main)",
                borderRadius: "50%",
                width: 44,
                height: 44,
                padding: 0,
                fontSize: 22,
                boxShadow: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
              title="Toggle Dark Mode"
          >
            {isDark ? "🌙" : "☀️"}
          </button>
        </div>

        <Link to="/"><img src={logo} alt="Game of Things" style={{width: 80}}/></Link>

        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "center",
          gap: 12,
          marginBottom: 4
        }}>
          <h2 style={{margin: 0}}>{gameTitle ?? gameId}</h2>
          {gameId && <span style={{color: 'var(--text-main)', fontSize: 14}}>(ID: {gameId})</span>}
        </div>
        <p style={{color: 'var(--text-main)', fontSize: 18, marginBottom: 20, minHeight: 27}}>
          {gameQuestion ? gameQuestion : <span style={{opacity: 0.5}}>Loading question...</span>}
        </p>

        {/* Scoreboard Toggle */}
        {scores.length > 0 && (
            <div style={{
              maxWidth: 600,
              margin: "0 auto 12px auto",
              display: "flex",
              justifyContent: "flex-end"
            }}>
              <button onClick={() => setShowScores(prev => !prev)}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: 'var(--text-main)',
                        fontSize: 14,
                        cursor: "pointer",
                        textDecoration: "underline",
                        fontWeight: 800
                      }}>
                {showScores ? "Hide scoreboard" : "Show scoreboard"}
              </button>
            </div>
        )}
        {scores.length > 0 && showScores && <Scoreboard scores={scores}/>}

        {/* Game Status */}
        {started && (
            <div style={{
              marginBottom: 20,
              padding: "10px 14px",
              borderRadius: 12,
              backgroundColor: 'var(--bg-secondary)',
              fontSize: 14,
              textAlign: "left",
              maxWidth: 600,
              marginInline: "auto"
            }}>
              <div style={{marginBottom: 6}}><strong>Already
                guessed:</strong> {guessedNames.length ? guessedNames.join(", ") : "No one yet"}
              </div>
              <div style={{marginBottom: 6}}><strong>Not yet
                guessed:</strong> {notGuessedNames.length ? notGuessedNames.join(", ") : "Everyone has been guessed!"}
              </div>
              <div><strong>Players Left:</strong> {turnOrder.length}</div>
            </div>
        )}

        {/* Input Section (Pre-Game) */}
        {/* Input Section (Pre-Game) */}
        {!started && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              alignItems: 'center',
              marginTop: 16
            }}>

              {/* Answer Input */}
              <input
                  value={entryText}
                  onChange={e => setEntryText(e.target.value)}
                  placeholder="Your answer"
                  // Update disabled logic:
                  disabled={isLoading || addEntryLoading || hasSubmitted}
                  style={{
                    width: '100%',
                    maxWidth: 400,
                    padding: '12px 16px',
                    fontSize: 16,
                    borderRadius: 12,
                    border: '1px solid var(--border-main)',
                    background: 'var(--bg-input)',
                    color: 'var(--text-main)'
                  }}
              />

              {/* Name Input */}
              <input
                  value={authorName}
                  onChange={e => setAuthorName(e.target.value)}
                  placeholder="Your name"
                  // Update disabled logic:
                  disabled={isLoading || addEntryLoading || hasSubmitted}
                  style={{
                    width: '100%',
                    maxWidth: 400,
                    padding: '12px 16px',
                    fontSize: 16,
                    borderRadius: 12,
                    border: '1px solid var(--border-main)',
                    background: 'var(--bg-input)',
                    color: 'var(--text-main)'
                  }}
              />

              <div style={{
                display: 'flex',
                gap: 16,
                width: '100%',
                maxWidth: 400,
                justifyContent: 'center'
              }}>

                {/* Add Answer Button */}
                <button
                    // CHANGE 1: Use the new wrapper function
                    onClick={handleAddEntry}

                    // CHANGE 2: Disable if hasSubmitted is true
                    disabled={isLoading || addEntryLoading || !entryText || !authorName || hasSubmitted}

                    style={{
                      flex: 1,
                      maxWidth: 140,
                      padding: '14px 24px',
                      borderRadius: 12,
                      border: 'none',
                      fontWeight: 600,
                      fontSize: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,

                      // CHANGE 3: Update background color logic
                      background: (entryText && authorName && !addEntryLoading && !hasSubmitted) ? 'var(--accent-blue)' : 'var(--disabled-bg)',

                      // CHANGE 4: Update cursor
                      cursor: (entryText && authorName && !addEntryLoading && !hasSubmitted) ? 'pointer' : 'not-allowed',

                      color: 'white'
                    }}>

                  {addEntryLoading ? (
                      <>
                        <span style={{
                          display: 'inline-block',
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          border: '2px solid rgba(255,255,255,0.5)',
                          borderTopColor: 'white',
                          animation: 'spin 1s linear infinite'
                        }}/>
                        Saving...
                      </>
                  ) : hasSubmitted ? 'Submitted!' : 'Add Answer'} {/* CHANGE 5: Update Text */}
                </button>


                <button onClick={() => setShowStartConfirm(true)}
                        disabled={!entries.length || started || isLoading}
                        style={{
                          flex: 1,
                          maxWidth: 140,
                          padding: '14px 24px',
                          borderRadius: 12,
                          border: 'none',
                          fontWeight: 600,
                          fontSize: 16,
                          background: entries.length && !started && !isLoading ? '#34c759' : '#c7c7cc',
                          color: 'white',
                          cursor: isLoading ? 'not-allowed' : 'pointer'
                        }}>
                  {isLoading ? (
                      <>
                        <span style={{
                          display: 'inline-block',
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          border: '2px solid rgba(255,255,255,0.5)',
                          borderTopColor: 'white',
                          animation: 'spin 1s linear infinite',
                          marginRight: 8
                        }}/>
                        Starting...
                      </>
                  ) : 'Start'}
                </button>
              </div>
            </div>
        )}

        {/* Turn Indicator */}
        {(turnOrder.length > 0 || started) && (
            <div
                className="flex items-center justify-center gap-4 p-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl shadow-2xl mb-6">
              <motion.div key={`arrow-${currentPlayer}`} initial={{rotate: -180}}
                          animate={{rotate: 0}} transition={{duration: 0.5, ease: "easeOut"}}
                          className="text-4xl">➡️
              </motion.div>
              <div className="text-center">
                <h2 className="text-2xl font-bold text-white drop-shadow-lg">{turnOrder.length >= 1 ? `${currentPlayer}'s turn!` : "All answers guessed!"}</h2>
              </div>
            </div>
        )}

        {/* New Round (End Game) */}
        {allGuessed && (
            <div style={{marginTop: 30}}>
              <input type="text" placeholder="Game Over! Ask a new question?" value={newQuestion}
                     onChange={e => setNewQuestion(e.target.value)} disabled={startNewRoundLoading}
                     style={{
                       padding: "12px 16px",
                       fontSize: 16,
                       width: "70%",
                       borderRadius: 12,
                       border: "1px solid #d1d1d6",
                       marginRight: 12
                     }}/>
              <button disabled={!newQuestion.trim() || startNewRoundLoading} onClick={startNewRound}
                      style={{
                        background: startNewRoundLoading || !newQuestion.trim() ? "#c7c7cc" : "#34c759",
                        padding: "12px 16px",
                        borderRadius: 12,
                        border: "none",
                        backgroundColor: 'var(--bg-secondary)',
                        color: 'var(--text-main)',
                        fontWeight: 600,
                        cursor: startNewRoundLoading ? "not-allowed" : "pointer"
                      }}>
                {startNewRoundLoading ? (
                    <>
                      <span style={{
                        display: 'inline-block',
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        color: 'white',
                        border: '2px solid rgba(255,255,255,0.5)',
                        borderTopColor: 'white',
                        animation: 'spin 1s linear infinite',
                        marginRight: 8
                      }}/>
                      Starting...
                    </>
                ) : "Start New Round"}
              </button>
            </div>
        )}

        {/* Answers List */}
        <ul>
          {started &&
              <p style={{marginBottom: 12, fontWeight: 600, color: 'var(--text-main)'}}>Your Group's
                Answers:</p>}
          {sortedEntriesForDisplay.length === 0 && <li>No entries found</li>}
          {sortedEntriesForDisplay.map(entry => (
              <motion.li key={entry.entryId} style={{margin: "10px 0"}}
                         initial={{opacity: 0, y: 10}} animate={{opacity: 1, y: 0}}
                         transition={{duration: 0.2}}>
                {started ? (
                    <button
                        ref={el => {
                          buttonRefs.current[entry.entryId] = el;
                        }}
                        disabled={!isMyTurn || entry.guessed || (entry.authorName === authorName && !isLastEntry)}
                        onClick={() => onEntryClick(entry)}
                        style={{
                          // If guessed, use Dark Blue. Otherwise, let CSS handle it (null/undefined)
                          backgroundColor: entry.guessed ? "#004080" : undefined,
                          color: entry.guessed ? "#ffffff" : undefined, // Ensure text is white on dark blue
                          opacity: entry.guessed ? 1 : undefined,       // Force opacity to 1 so it doesn't look "disabled/faded"
                          border: entry.guessed ? "1px solid #003366" : undefined
                        }}
                    >
                      {entry.text}

                      {entry.guessed && (
                          <span style={{marginLeft: "8px", fontWeight: "600", color: "#80c1ff"}}>
            -{entry.authorName}
        </span>
                      )}
                    </button>
                ) : (
                    // PRE-GAME STATE (Blurred / Hidden)
                    // Check if this is MY entry
                    entry.authorName === authorName ? (
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',      // Stack vertical
                          alignItems: 'center',         // Center horizontal
                          justifyContent: 'center',     // Center vertical
                          color: 'var(--accent-blue)',
                          fontWeight: 600,
                          textAlign: 'center'
                        }}>
                          {/* Answer Text */}
                          <span style={{ fontSize: '16px' }}>
                                {entry.text}
                            </span>

                          {/* Label */}
                          <span style={{
                            fontSize: '12px',
                            opacity: 0.7,
                            marginTop: 4,
                            fontWeight: 400
                          }}>
                                (Your submission, not viewable to others yet)
                            </span>
                        </div>
                    ) : (

                        // Everyone else's entry (Blurred)
                        <span style={{
                          filter: "blur(6px)",
                          color: "rgba(0,0,0,0.6)",
                          userSelect: "none",
                          textShadow: "0 0 2px rgba(0,0,0,0.1)"
                        }}>
                            {entry.text}
                        </span>
                    )
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
                                    onClick={() => {
                                      if (guessingEntry && !disabled && !guessLoading) guessAuthor(guessingEntry.entryId, name);
                                    }}
                                    style={{
                                      width: "75%",
                                      padding: "12px 14px",
                                      borderRadius: 12,
                                      border: "none",
                                      textAlign: "center",
                                      marginBottom: 8,
                                      backgroundColor: disabled || guessLoading ? "#e5e5ea" : "#007aff",
                                      color: disabled || guessLoading ? "#8e8e93" : "white",
                                      cursor: disabled || guessLoading ? "default" : "pointer"
                                    }}>
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
                }}/>
                      Guessing...
                    </div>
                )}

                <button className="cancel-button" onClick={() => setGuessingEntry(null)}>Cancel
                </button>
              </div>
            </div>
        )}

        {/* Start Confirmation Modal */}
        {showStartConfirm && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2000
            }}>
              <div style={{
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-main)',
                borderRadius: 20,
                padding: 32,
                maxWidth: 400,
                textAlign: 'center',
                boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
              }}>
                <h3 style={{
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-main)',
                  margin: '0 0 16px',
                  fontSize: 24,
                  fontWeight: 600
                }}>👥 Is everyone
                  ready?</h3>
                <p style={{
                  margin: '0 0 32px',
                  color: 'var(--text-main)',
                }}>Once you press Start, answers are
                  revealed. Refresh your screens!</p>
                <div style={{display: 'flex', gap: 12, justifyContent: 'center'}}>
                  <button onClick={() => {
                    setShowStartConfirm(false);
                    startGame();
                  }} style={{
                    flex: 1,
                    background: '#34c759',
                    color: 'white',
                    padding: '14px 24px',
                    borderRadius: 12,
                    border: 'none',
                    fontWeight: 600
                  }}>Yes, Start Game!
                  </button>
                  <button onClick={() => setShowStartConfirm(false)} style={{
                    flex: 1,
                    background: '#f2f2f7',
                    color: '#007aff',
                    padding: '14px 24px',
                    borderRadius: 12,
                    border: 'none',
                    fontWeight: 600
                  }}>Wait, Not Yet
                  </button>
                </div>
              </div>
            </div>
        )}

        {/* How To Play & Toast */}
        <div style={{
          maxWidth: 600,
          margin: "24px auto 0 auto",
          display: "flex",
          justifyContent: "flex-start",
          gap: 8
        }}>
          <button onClick={() => setShowHowToPlay(prev => !prev)} style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: "none",
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-main)'
          }}>
            i
          </button>
        </div>
        {showHowToPlay && (
            <div style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-main)',
              maxWidth: 600,
              margin: "8px auto 20px auto",
              padding: "12px 16px",
              borderRadius: 12,
              fontSize: 14,
              lineHeight: 1.5,
              textAlign: "left",
            }}>
              <p style={{marginTop: 0, marginBottom: 8}}>
                How to play: Each person secretly writes an answer to the question and adds it to
                the list.
              </p>
              <p style={{margin: 0, marginBottom: 8}}>
                When the host starts the game, all answers are revealed. Taking turns, tap an
                answer and then choose who you think wrote it. If you're right, you go again!
              </p>
              <p style={{margin: 0}}>
                Correct guesses mark that person as guessed. Keep going until everyone has
                been guessed. Once you're the last remaining player, you can guess yourself for a
                free point to end the game. Then, ask a new question and start a new round.
              </p>
            </div>
        )}
        {toast && (
            <div style={{
              position: 'fixed',
              top: '20px',
              left: 0,
              width: '100%',
              display: 'flex',
              justifyContent: 'center',
              zIndex: 2000,
              pointerEvents: 'none',
              animation: 'fadeScaleIn 0.3s ease-out forwards'
            }}>
              <div style={{
                backgroundColor: toast.type === 'success' ? '#34c759' : '#ff3b30',
                color: 'white',
                padding: '12px 20px',
                borderRadius: '12px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                fontWeight: 600,
                pointerEvents: 'auto',
                animation: 'fadeScaleIn 0.3s ease-out forwards'
              }}>
                {toast.message}
              </div>
            </div>
        )}
      </div>
  );
}
