import SwiftUI

/// Seconds as m:ss, e.g. 75 -> "1:15" (mirrors client/src/components/TurnTimer.tsx).
func clockText(_ totalSeconds: Int) -> String {
    let seconds = max(0, totalSeconds)
    return "\(seconds / 60):" + String(format: "%02d", seconds % 60)
}

/// Countdown to `endsAt` (the device-clock moment `GameStore.localDeadline` worked out). At 0:00
/// it stays put and tells the player to hurry: the turn is never ended for them.
struct TurnTimerLabel: View {
    let endsAt: Date
    let hurry: String

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.25)) { context in
            let secondsLeft = max(0, Int(endsAt.timeIntervalSince(context.date).rounded(.up)))
            HStack(spacing: 8) {
                Text(clockText(secondsLeft))
                    .font(.title3.bold().monospacedDigit())
                    .accessibilityLabel("Time left this turn: \(clockText(secondsLeft))")
                if secondsLeft == 0 {
                    Text(hurry)
                        .font(.footnote.bold())
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(.red, in: .capsule)
                }
            }
        }
    }
}

/// Fades an answer in a beat after the one before it when the answers are revealed at the start
/// of a round (#72). Reduced motion shows it at once.
struct RevealModifier: ViewModifier {
    let index: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false

    func body(content: Content) -> some View {
        let visible = shown || reduceMotion
        content
            .opacity(visible ? 1 : 0)
            .offset(y: visible ? 0 : 12)
            .scaleEffect(visible ? 1 : 0.97)
            .onAppear {
                // Capped, so a big group doesn't wait long for the last answer.
                withAnimation(.spring(duration: 0.3, bounce: 0).delay(Double(min(index, 8)) * 0.06)) {
                    shown = true
                }
            }
    }
}
