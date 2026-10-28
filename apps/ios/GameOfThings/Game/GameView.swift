import SwiftUI

/// Port of client/src/pages/StartGamePage.tsx.
struct GameView: View {
    @State private var store: GameStore
    @State private var showScores = false
    @State private var showHowToPlay = false
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(gameId: String) {
        _store = State(initialValue: GameStore(gameId: gameId))
    }

    var body: some View {
        List {
            header
            if !store.turnOrder.isEmpty || store.started { turnSection }
            if store.started { statusSection }
            if !store.started { answerFormSections }
            if store.allGuessed { nextRoundSections }
            answersSection
            if !store.scores.isEmpty { scoreboardSection }
            howToPlaySection
        }
        .animation(.spring(duration: 0.3, bounce: 0), value: store.entries)
        .animation(.spring(duration: 0.3, bounce: 0), value: store.started)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ThemeToggleButton() }
        .overlay(alignment: .top) { toastOverlay }
        .overlay { ConfettiBurst(trigger: reduceMotion ? 0 : store.correctGuessCount) }
        .sensoryFeedback(.success, trigger: store.correctGuessCount)
        .sensoryFeedback(.error, trigger: store.wrongGuessCount)
        .sensoryFeedback(trigger: store.isMyTurn) { _, isMine in isMine ? .impact : nil }
        .sheet(item: $store.guessingEntry) { entry in
            GuessSheet(store: store, entry: entry)
        }
        .alert("Is everyone ready?", isPresented: $store.showStartConfirm) {
            Button("Yes, Start Game!") { Task { await store.startGame() } }
            Button("Wait, Not Yet", role: .cancel) {}
        } message: {
            Text("Once you press Start, answers are revealed. Refresh your screens!")
        }
        .onAppear { store.start() }
        .onDisappear { store.stop() }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active: store.enterForeground()
            case .background: store.enterBackground()
            default: break
            }
        }
        .onChange(of: store.toast) { _, toast in
            if let toast { AccessibilityNotification.Announcement(toast.message).post() }
        }
    }

    // MARK: - Sections

    private var header: some View {
        Section {
            VStack(spacing: 8) {
                AnimatedLogo()
                    .frame(width: 64, height: 64)
                    .clipShape(.rect(cornerRadius: 15, style: .continuous))
                    .accessibilityHidden(true)
                Text(store.gameTitle ?? store.gameId)
                    .font(.title2.bold())
                    .multilineTextAlignment(.center)
                Text(store.gameId)
                    .font(.footnote.weight(.semibold).monospacedDigit())
                    .tracking(1.2)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 3)
                    .background(.fill.tertiary, in: .capsule)
                    .accessibilityLabel("Game code \(store.gameId)")
                    .contextMenu {
                        Button("Copy Code", systemImage: "doc.on.doc") { UIPasteboard.general.string = store.gameId }
                    }
                Group {
                    if let question = store.gameQuestion {
                        Text(question)
                    } else {
                        Text("Loading question...").foregroundStyle(.tertiary)
                    }
                }
                .font(.title3.weight(.semibold))
                .multilineTextAlignment(.center)
                .padding(.top, 4)
            }
            .frame(maxWidth: .infinity)
            .listRowBackground(Color.clear)
        }
    }

    private var turnSection: some View {
        let inProgress = !store.turnOrder.isEmpty
        return Section {
            HStack(spacing: 14) {
                Image(systemName: inProgress ? "arrow.right" : "checkmark")
                    .font(.title3.bold())
                    .frame(width: 40, height: 40)
                    .background(.white.opacity(0.2), in: .circle)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(inProgress ? (store.isMyTurn ? "Your turn" : "Now guessing") : "Round over")
                        .font(.footnote.weight(.semibold))
                        .textCase(.uppercase)
                        .opacity(0.75)
                    Text(inProgress ? "\(store.currentPlayer ?? "")'s turn!" : "All answers guessed!")
                        .font(.title2.bold())
                        .contentTransition(.opacity)
                }
                Spacer(minLength: 0)
            }
            .foregroundStyle(.white)
            .padding(.vertical, 6)
            .accessibilityElement(children: .combine)
            .listRowBackground(inProgress ? Color.blue : Color.green)
            .animation(.spring(duration: 0.4, bounce: 0), value: store.currentPlayer)
        }
    }

    private var statusSection: some View {
        Section {
            StatRow(label: "Already guessed",
                    value: store.guessedNames.isEmpty ? "No one yet" : store.guessedNames.joined(separator: ", "))
            StatRow(label: "Players left", value: "\(store.turnOrder.count)")
            StatRow(label: "Not yet guessed",
                    value: store.notGuessedNames.isEmpty ? "Everyone has been guessed!" : store.notGuessedNames.joined(separator: ", "))
        }
    }

    @ViewBuilder private var answerFormSections: some View {
        Section {
            TextField("Your answer", text: $store.entryText, axis: .vertical)
            TextField("Your name", text: $store.authorName)
                .textContentType(.givenName)
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
        }
        .disabled(store.isStarting || store.addEntryLoading || store.hasSubmitted)
        Section {
            HStack(spacing: 12) {
                FormButton(title: store.hasSubmitted ? "Submitted!" : "Add Answer", busyTitle: "Saving...",
                           isBusy: store.addEntryLoading) {
                    Task { await store.addEntry() }
                }
                .disabled(!store.canAddEntry)
                FormButton(title: "Start", busyTitle: "Starting...", isBusy: store.isStarting, tint: .green) {
                    store.showStartConfirm = true
                }
                .disabled(!store.canStart)
            }
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
        }
        .listSectionSpacing(.compact)
    }

    @ViewBuilder private var nextRoundSections: some View {
        Section("Next Round") {
            TextField("Game Over! Ask a new question?", text: $store.newQuestion, axis: .vertical)
                .disabled(store.startNewRoundLoading)
        }
        Section {
            FormButton(title: "Start New Round", busyTitle: "Starting...", isBusy: store.startNewRoundLoading,
                       tint: .green) {
                Task { await store.startNewRound() }
            }
            .disabled(store.newQuestion.trimmed.isEmpty || store.startNewRoundLoading)
        } footer: {
            Text("The player who has gone the longest ago goes first.")
        }
        .listSectionSpacing(.compact)
    }

    private var answersSection: some View {
        Section(store.started ? "Your Group's Answers" : "Answers (\(store.entries.count))") {
            if store.entries.isEmpty {
                Text("No entries yet").foregroundStyle(.secondary)
            }
            ForEach(store.sortedEntriesForDisplay) { entry in
                if store.started {
                    Button { store.guessingEntry = entry } label: {
                        HStack {
                            Text(entry.text)
                                .foregroundStyle(entry.guessed ? .secondary : .primary)
                            Spacer()
                            if entry.guessed {
                                Text(entry.authorName)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(.blue)
                            } else {
                                Image(systemName: "chevron.right")
                                    .font(.footnote.weight(.semibold))
                                    .foregroundStyle(.tertiary)
                            }
                        }
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .disabled(!store.canGuess(entry))
                    .accessibilityHint(store.canGuess(entry) ? "Guess who wrote this" : "")
                } else if entry.authorName == store.authorName {
                    // Pre-game: my own entry is visible to me only
                    VStack(alignment: .leading, spacing: 2) {
                        Text(entry.text)
                            .fontWeight(.semibold)
                            .foregroundStyle(.blue)
                        Text("Your submission, not viewable to others yet")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    // Pre-game: everyone else's entry is blurred
                    Text(entry.text)
                        .foregroundStyle(.secondary)
                        .blur(radius: 6)
                        .privacySensitive()
                        .accessibilityLabel("Hidden answer")
                }
            }
        }
    }

    private var scoreboardSection: some View {
        Section {
            DisclosureGroup("Scoreboard", isExpanded: $showScores) {
                ScoreboardRows(scores: store.scores)
            }
        }
    }

    private var howToPlaySection: some View {
        Section {
            DisclosureGroup("How to play", isExpanded: $showHowToPlay) {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Each person secretly writes an answer to the question and adds it to the list.")
                    Text("When the host starts the game, all answers are revealed. Taking turns, tap an answer and then choose who you think wrote it. If you're right, you go again!")
                    Text("Correct guesses mark that person as guessed. Keep going until everyone has been guessed. Once you're the last remaining player, you can guess yourself for a free point to end the game. Then, ask a new question and start a new round—the player who has gone the longest ago goes first.")
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .padding(.vertical, 4)
            }
        }
    }

    private var toastOverlay: some View {
        ZStack {
            if let toast = store.toast {
                ToastView(toast: toast)
                    .onTapGesture { store.dismissToast() }
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .id(toast.id)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .animation(.spring(duration: 0.35, bounce: 0), value: store.toast)
    }
}

private struct StatRow: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text(value)
        }
        .accessibilityElement(children: .combine)
    }
}

private struct ToastView: View {
    let toast: Toast

    var body: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(toast.style == .success ? Color.green : Color.red)
                .frame(width: 8, height: 8)
            Text(toast.message)
                .font(.subheadline.weight(.medium))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(.regularMaterial, in: .capsule)
        .shadow(color: .black.opacity(0.15), radius: 20, y: 8)
    }
}
