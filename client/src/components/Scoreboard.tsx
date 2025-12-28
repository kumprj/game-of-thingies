// src/components/Scoreboard.tsx
import React from "react";
import { Entry, Score } from "../../../types";

interface Props {
  scores: Score[];
}

export default function Scoreboard({ scores }: Props) {
  return (
      <div style={{
        marginBottom: 20, padding: "12px 16px", borderRadius: 16,
        backgroundColor: "#f2f2f7", maxWidth: 600, marginInline: "auto", fontSize: 14
      }}>
        <div style={{ marginBottom: 8, fontWeight: 700, textAlign: "left", color: "#1d1d1f" }}>
          Scoreboard
        </div>
        {scores.map((s, index) => {
          const rank = index + 1;
          let bg = "#0f5cc0";
          if (rank === 1) bg = "#f6c453";
          else if (rank === 2) bg = "#c0c4cc";
          else if (rank === 3) bg = "#cd7f32";

          return (
              <div key={s.playerName} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginTop: 6, padding: "8px 10px", borderRadius: 999,
                backgroundColor: bg, color: "white"
              }}>
                <span style={{ fontWeight: 600, minWidth: 20 }}>#{rank}</span>
                <span style={{ flex: 1, marginLeft: 8, textAlign: "left" }}>{s.playerName}</span>
                <span style={{ fontWeight: 700 }}>{s.score}</span>
              </div>
          );
        })}
      </div>
  );
}
