import SwiftUI

/// Port of Scoreboard.tsx: ranked rows, top three in gold / silver / bronze.
struct ScoreboardRows: View {
    let scores: [Score]

    var body: some View {
        ForEach(Array(scores.enumerated()), id: \.element.playerName) { index, score in
            let rank = index + 1
            HStack(spacing: 12) {
                Text("#\(rank)")
                    .font(.caption.bold())
                    .foregroundStyle(rank <= 3 ? Color.black : Color.secondary)
                    .frame(width: 28, height: 28)
                    .background(badge(for: rank), in: .circle)
                Text(score.playerName)
                    .fontWeight(.medium)
                Spacer()
                Text("\(score.score)")
                    .fontWeight(.semibold)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
        }
    }

    private func badge(for rank: Int) -> AnyShapeStyle {
        switch rank {
        case 1: AnyShapeStyle(Color.yellow)
        case 2: AnyShapeStyle(Color(.systemGray2))
        case 3: AnyShapeStyle(Color.brown)
        default: AnyShapeStyle(.fill.tertiary)
        }
    }
}
