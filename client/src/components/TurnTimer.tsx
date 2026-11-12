import {useEffect, useState} from "react";

/** Seconds as m:ss, e.g. 75 -> "1:15". */
export function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Countdown to `endsAt` (epoch ms on this device's clock; the hook converts the server's deadline).
 * At 0:00 it stays put and tells the player to hurry: the turn is never ended for them.
 */
export default function TurnTimer({endsAt, hurry}: {endsAt: number | null | undefined; hurry: string}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt == null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);

  if (endsAt == null) return null;
  const secondsLeft = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const expired = secondsLeft === 0;
  return (
    <div className={`turn-timer${expired ? " expired" : ""}`}>
      <span role="timer" aria-label="Time left this turn">{formatClock(secondsLeft)}</span>
      {expired && <span role="status">{hurry}</span>}
    </div>
  );
}
