import SwiftUI

/// "Who wrote this?" picker for a revealed answer.
struct GuessSheet: View {
    let store: GameStore
    let entry: Entry
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                Text("Who wrote this?")
                    .font(.title3.bold())
                Text("“\(entry.text)”")
                    .font(.body)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .padding(.bottom, 8)
                ForEach(store.uniqueNames, id: \.self) { name in
                    Button {
                        Task { await store.guess(entry, author: name) }
                    } label: {
                        Text(name).frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                    .disabled(store.isFullyGuessed(name) || store.guessLoading)
                }
                if store.guessLoading {
                    HStack(spacing: 8) {
                        ProgressView()
                        Text("Guessing...")
                    }
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(8)
                }
                Button {
                    dismiss()
                } label: {
                    Text("Cancel").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(.gray)
                .controlSize(.large)
            }
            .padding(24)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}
