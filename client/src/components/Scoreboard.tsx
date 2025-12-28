// src/components/Scoreboard.tsx

import React from "react";
import {Entry, Score} from "../../../types";

/**
 * Props interface for the Scoreboard component.
 * @property {Score[]} scores - An array of player scores to display.
 */
interface Props {
  scores: Score[];
}

/**
 * Scoreboard component to display a list of player scores with rankings.
 *
 * @param {Props} props - The props for the component.
 * @param {Score[]} props.scores - The array of scores to display.
 * @returns {JSX.Element} The rendered Scoreboard component.
 */
export default function Scoreboard({scores}: Props) {
  return (
      <div style={{
        marginBottom: 20, padding: "12px 16px", borderRadius: 16, color: 'var(--text-main)',
        backgroundColor: 'var(--bg-secondary)', maxWidth: 600, marginInline: "auto", fontSize: 14
      }}>
        {/* Header for the scoreboard */}
        <div style={{
          marginBottom: 8,
          fontWeight: 700,
          textAlign: "left",
          color: 'var(--text-main)'
        }}>
          Scoreboard
        </div>
        {/* Map through the scores array and render each player's score */}
        {scores.map((s, index) => {
          const rank = index + 1; // Calculate the player's rank based on their position in the array
          let bg = "#0f5cc0"; // Default background color for ranks other than 1, 2, or 3
          if (rank === 1) bg = "#e3af37"; // Gold for 1st place
          else if (rank === 2) bg = "#b3b7be"; // Silver for 2nd place
          else if (rank === 3) bg = "#c47930"; // Bronze for 3rd place

          return (
              <div key={s.playerName} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginTop: 6, padding: "8px 10px", borderRadius: 999,
                backgroundColor: bg,
                color: 'var(--text-main)',
              }}>
                {/* Display the player's rank */}
                <span style={{
                  color: 'var(--text-main)',
                  fontWeight: 800,
                  minWidth: 20
                }}>#{rank}</span>
                {/* Display the player's name */}
                <span style={{
                  color: 'var(--text-main)',
                  flex: 1,
                  fontWeight: 800,
                  marginLeft: 8,
                  textAlign: "left"
                }}>{s.playerName}</span>
                {/* Display the player's score */}
                <span style={{color: 'var(--text-main)', fontWeight: 1000}}>{s.score}</span>
              </div>
          );
        })}
      </div>
  );
}