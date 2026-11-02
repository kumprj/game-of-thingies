import SwiftUI

/// Port of client/src/pages/HomePage.tsx.
struct HomeView: View {
    let openGame: (String) -> Void

    @State private var gameName = ""
    @State private var questionText = ""
    @State private var joinCode = ""
    @State private var creatingGame = false
    @State private var createError: String?
    @State private var recentGames: [RecentGameRecord] = []

    private let api = APIClient()

    /// Same limits as the server (server/gameSetup.ts)
    static let maxGameNameLength = 50
    static let maxQuestionLength = 200

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
                    AnimatedLogo()
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
                    .onChange(of: gameName) { _, new in
                        if new.count > Self.maxGameNameLength { gameName = String(new.prefix(Self.maxGameNameLength)) }
                    }
                TextField("What question would you like to ask?", text: $questionText, axis: .vertical)
                    .onChange(of: questionText) { _, new in
                        if new.count > Self.maxQuestionLength { questionText = String(new.prefix(Self.maxQuestionLength)) }
                    }
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

            if !recentGames.isEmpty {
                Section("Recent Games") {
                    ForEach(recentGames) { recent in
                        Button {
                            openGame(recent.gameId)
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(recent.title)
                                        .font(.body.weight(.medium))
                                        .foregroundStyle(.primary)
                                    Text("Code: \(recent.gameId)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.caption)
                                    .foregroundStyle(.tertiary)
                            }
                        }
                    }
                    .onDelete(perform: deleteRecent)
                }
            }

            Section {
                VStack(alignment: .leading, spacing: 10) {
                    Text("How to Play").font(.headline)
                    VStack(alignment: .leading, spacing: 6) {
                        Text("1. **Create or join:** Host enters a title and question prompt. Share the 4-letter code with players.")
                        Text("2. **Submit secretly:** Each player submits their answer and name before the game starts.")
                        Text("3. **Take turns guessing:** The host starts the game to reveal the shuffled answers. On your turn, pick an answer and guess who wrote it.")
                        Text("4. **Earn points:** Correct guesses earn points and keep your turn. Once all answers are guessed, the host can start a new round!")
                    }
                    .font(.subheadline)
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
        .alert(createError ?? "", isPresented: Binding(get: { createError != nil }, set: { if !$0 { createError = nil } })) {}
        .onAppear { loadRecentGames() }
    }

    private func loadRecentGames() {
        if let data = UserDefaults.standard.data(forKey: "got_recent_games"),
           let list = try? JSONDecoder().decode([RecentGameRecord].self, from: data) {
            recentGames = list
        } else {
            recentGames = []
        }
    }

    private func deleteRecent(at offsets: IndexSet) {
        recentGames.remove(atOffsets: offsets)
        if let data = try? JSONEncoder().encode(recentGames) {
            UserDefaults.standard.set(data, forKey: "got_recent_games")
        }
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
                createError = (error as? APIError)?.serverMessage ?? "Failed to create game. Please try again."
            }
        }
    }
}

struct RecentGameRecord: Codable, Identifiable {
    var id: String { gameId }
    let gameId: String
    let title: String
    let lastVisited: Double
}

extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
