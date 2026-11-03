import React, {useState} from "react";
import {useDarkMode} from "../hooks/useDarkMode";
import {isSoundEnabled, setSoundEnabled} from "../audio";

/**
 * Translucent sticky nav bar with an optional leading element and the theme toggle.
 */
export default function TopBar({title, children}: { title?: React.ReactNode; children?: React.ReactNode }) {
  const {isDark, toggleTheme} = useDarkMode();
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());

  const handleToggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
  };

  return (
      <header className="topbar">
        <div>
          {title && <span className="topbar-title">{title}</span>}
          {children}
        </div>
        <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
          <button
              className="icon-btn"
              onClick={handleToggleSound}
              title={soundOn ? "Mute Sound" : "Enable Sound"}
              aria-label={soundOn ? "Mute Sound" : "Enable Sound"}
          >
            {soundOn ? (
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M14 3.23v17.54c0 .89-1.08 1.34-1.71.71L7.41 16.6H3c-.55 0-1-.45-1-1V8.4c0-.55.45-1 1-1h4.41l4.88-4.88c.63-.63 1.71-.18 1.71.71zm4.5 8.77c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM16 4.41v2.06c3.01.89 5.2 3.67 5.2 6.98s-2.19 6.09-5.2 6.98v2.06c4.15-.97 7.2-4.73 7.2-9.04s-3.05-8.07-7.2-9.04z" />
                </svg>
            ) : (
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27l4.73 4.73H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4.41L9.91 6.5l2.09 2.09V4.41z" />
                </svg>
            )}
          </button>
          <button
              className="icon-btn"
              onClick={toggleTheme}
              title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
              aria-label="Toggle Dark Mode"
          >
            {isDark ? (
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M21 14.5A9 9 0 0 1 9.5 3a9 9 0 1 0 11.5 11.5Z"/>
                </svg>
            ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                     strokeLinecap="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none"/>
                  <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>
                </svg>
            )}
          </button>
        </div>
      </header>
  );
}
