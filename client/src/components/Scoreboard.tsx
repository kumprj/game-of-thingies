// src/components/Scoreboard.tsx

import React from "react";
import {Score} from "../../../types";

/**
 * Props interface for the Scoreboard component.
 * @property {Score[]} scores - An array of player scores to display.
 */
interface Props {
  scores: Score[];
}

/**
 * Scoreboard component to display a list of player scores with rankings.
 * Top three get gold / silver / bronze rank badges.
 */
export default function Scoreboard({scores}: Props) {
  return (
      <section>
        <h4 className="section-label">Scoreboard</h4>
        <ul className="list">
          {scores.map((s, index) => {
            const rank = index + 1;
            return (
                <li key={s.playerName} className="score-row">
                  <span className={`rank rank-${rank}`}>#{rank}</span>
                  <span className="score-name">{s.playerName}</span>
                  <span className="score-value">{s.score}</span>
                </li>
            );
          })}
        </ul>
      </section>
  );
}
