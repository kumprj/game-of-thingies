import React from "react";
import {useDarkMode} from "../hooks/useDarkMode";

/**
 * Translucent sticky nav bar with an optional leading element and the theme toggle.
 */
export default function TopBar({children}: { children?: React.ReactNode }) {
  const {isDark, toggleTheme} = useDarkMode();

  return (
      <header className="topbar">
        <div>{children}</div>
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
      </header>
  );
}
