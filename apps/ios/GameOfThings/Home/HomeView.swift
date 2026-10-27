import SwiftUI

/// Port of client/src/pages/HomePage.tsx.
struct HomeView: View {
    let openGame: (String) -> Void

    @State private var gameName = ""
    @State private var questionText = ""
    @State private var joinCode = ""
    @State private var creatingGame = false
    @State private var showCreateError = false

    private let api = APIClient()

    private var createDisabled: Bool {
        creatingGame || gameName.trimmed.isEmpty || questionText.trimmed.isEmpty
    }

    /// Exactly 4 uppercase letters A–Z
    private var joinDisabled: Bool {
        creatingGame || joinCode.count != 4
    }

    var body: some View {
        Form {
            Section {
                VStack(spacing: 6) {
                    Image("Logo")
                        .resizable()
                        .frame(width: 96, height: 96)
                        .clipShape(.rect(cornerRadius: 22, style: .continuous))
                        .accessibilityHidden(true)
                    Text("Game of Things")
                        .font(.largeTitle.bold())
                        .padding(.top, 6)
                    Text("Guess who wrote what.")
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .listRowBackground(Color.clear)
            }

            Section("New Game") {
                TextField("Enter a title for your game", text: $gameName)
                TextField("What question would you like to ask?", text: $questionText, axis: .vertical)
                    .submitLabel(.go)
                    .onSubmit { if !createDisabled { createGame() } }
            }
            .disabled(creatingGame)
            Section {
                FormButton(title: "Create Game", busyTitle: "Creating...", isBusy: creatingGame, action: createGame)
                    .disabled(createDisabled)
            }
            .listSectionSpacing(.compact)

            Section("Join Existing Game") {
                TextField("Enter 4-letter game code", text: $joinCode)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .submitLabel(.join)
                    .onSubmit { if !joinDisabled { openGame(joinCode) } }
                    .onChange(of: joinCode) { _, new in
                        let cleaned = String(new.uppercased().filter { ("A"..."Z").contains($0) }.prefix(4))
                        if cleaned != new { joinCode = cleaned }
                    }
            }
            .disabled(creatingGame)
            Section {
                FormButton(title: "Join Game", prominent: false) { openGame(joinCode) }
                    .disabled(joinDisabled)
            }
            .listSectionSpacing(.compact)

            Section {
                VStack(alignment: .leading, spacing: 10) {
                    Text("How to Play").font(.headline)
                    Text("The game host will enter a game title (this can be anything), and a question prompt to ask the room. When the host taps Create Game, a 4-letter code will be generated for them to share with people to join the game. Then, submit your answer along with your name. Once everyone has submitted and the group is ready, the host will tap to start the game to reveal the shuffled entries. When it is your turn, try to guess who wrote each entry—getting correct guesses earns points! Once all guesses are made, a new question box will pop up to start a new round. The player who has gone the longest ago goes first.")
                    Text("Have fun and enjoy the Game of Things!")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 6)
            }
        }
        .navigationTitle("Home")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(removing: .title)
        .toolbar { ThemeToggleButton() }
        .alert("Failed to create game. Please try again.", isPresented: $showCreateError) {}
    }

    private func createGame() {
        guard !createDisabled else { return }
        creatingGame = true
        Task {
            defer { creatingGame = false }
            do {
                let gameId = try await api.createGame(name: gameName.trimmed, question: questionText.trimmed)
                openGame(gameId)
            } catch {
                showCreateError = true
            }
        }
    }
}

extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
