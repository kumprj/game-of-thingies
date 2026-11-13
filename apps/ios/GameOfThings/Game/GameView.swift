import SwiftUI

/// Port of client/src/pages/StartGamePage.tsx.
struct GameView: View {
    @State private var store: GameStore
    @State private var showScores = false
    @State private var showHowToPlay = false
    @State private var isChangingName = false
    @State private var editingEntryId: String? = nil
    @State private var editingEntryText = ""
    @FocusState private var focusedField: AnswerField?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    enum AnswerField: Hashable {
        case answer, name
    }

    init(gameId: String) {
        _store = State(initialValue: GameStore(gameId: gameId, liveActivity: LiveActivityController()))
    }

    var body: some View {
        List {
            if store.gameNotFound {
                notFoundSection
            } else {
                header
                if store.hasSubmitted { notificationsSection }
                if !store.turnOrder.isEmpty || store.started { turnSection }
                if store.started { statusSection }
                if !store.started { answerFormSections }
                if store.allGuessed && store.isHost { nextRoundSections }
                if store.allGuessed, let recap = store.roundRecapText {
                    recapSection(recap)
                }
                answersSection
                if !store.scores.isEmpty { scoreboardSection }
                howToPlaySection
            }
        }
        .refreshable { await store.sync() }
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
            Text("Once you press Start, answers are revealed.")
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
        // iOS hands out the push token a moment after permission, so register once it arrives
        .onChange(of: PushRegistrar.shared.deviceToken) { Task { await store.registerDevice() } }
        .onChange(of: store.toast) { _, toast in
            if let toast { AccessibilityNotification.Announcement(toast.message).post() }
        }
        .onChange(of: store.allGuessed) { _, allGuessed in
            if allGuessed { showScores = true }
        }
    }

    // MARK: - Sections

    private var notFoundSection: some View {
        Section {
            VStack(spacing: 12) {
                Text("Game not found")
                    .font(.title2.bold())
                Text("There's no game with the code \(store.gameId). Check the code and try again.")
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                FormButton(title: "Back to Home") { dismiss() }
            }
            .frame(maxWidth: .infinity)
            .listRowBackground(Color.clear)
        }
    }

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
                HStack(spacing: 8) {
                    Button {
                        UIPasteboard.general.string = store.gameId
                        store.show("Copied code \(store.gameId)")
                    } label: {
                        Text(store.gameId)
                            .font(.footnote.weight(.semibold).monospacedDigit())
                            .tracking(1.2)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 3)
                            .background(.fill.tertiary, in: .capsule)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Game code \(store.gameId). Tap to copy.")

                    if let shareURL = URL(string: "https://gameofthings.fun/\(store.gameId)") {
                        ShareLink(item: shareURL) {
                            Image(systemName: "square.and.arrow.up")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .padding(6)
                                .background(.fill.tertiary, in: .circle)
                        }
                        .accessibilityLabel("Share game link")
                    }

                    if store.isHost && !store.otherPlayers.isEmpty {
                        Menu {
                            ForEach(store.otherPlayers, id: \.self) { player in
                                Button(player) {
                                    Task { await store.transferHost(to: player) }
                                }
                            }
                        } label: {
                            Image(systemName: "person.badge.key")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .padding(6)
                                .background(.fill.tertiary, in: .circle)
                        }
                        .accessibilityLabel("Transfer host")
                    }
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

    private var notificationsSection: some View {
        Section {
            Toggle("Notify me on my turn", isOn: Binding(
                get: { store.notificationsEnabled },
                set: { on in Task { await store.setNotifications(enabled: on) } }))
        } footer: {
            Text("A notification when it's your turn or a new round starts. It never includes answers.")
        }
    }

    private var turnSection: some View {
        let inProgress = !store.turnOrder.isEmpty
        return Section {
            VStack(alignment: .leading, spacing: 8) {
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
                        if inProgress, let endsAt = store.turnEndsAt {
                            TurnTimerLabel(endsAt: endsAt,
                                           hurry: store.isMyTurn ? "Time's up, hurry up!"
                                               : "Time's up. Hurry up, \(store.currentPlayer ?? "")!")
                        }
                    }
                    Spacer(minLength: 0)
                    if store.isHost && inProgress && !store.allGuessed {
                        Button("Skip") {
                            Task { await store.skipTurn() }
                        }
                        .font(.subheadline.bold())
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(.white.opacity(0.25), in: .capsule)
                        .accessibilityLabel("Skip player's turn")
                    }
                }
                if inProgress && store.turnOrder.count > 1 {
                    HStack(spacing: 4) {
                        Text("Up next:")
                            .font(.caption)
                            .opacity(0.8)
                        ForEach(Array(store.turnOrder.dropFirst().enumerated()), id: \.element) { index, name in
                            if index > 0 { Text("→").font(.caption2).opacity(0.6) }
                            Text(name)
                                .font(.caption.bold())
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(.white.opacity(0.2), in: .capsule)
                        }
                    }
                }
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
                .accessibilityLabel("Your answer")
                .focused($focusedField, equals: .answer)
                .submitLabel(.next)
                .onSubmit { focusedField = .name }

            if !store.authorName.isEmpty && !isChangingName && !store.hasSubmitted {
                HStack {
                    Text("Playing as ") + Text(store.authorName).bold()
                    Spacer()
                    Button("change") { isChangingName = true }
                        .font(.subheadline)
                }
            } else {
                TextField("Your name", text: $store.authorName)
                    .textContentType(.givenName)
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled()
                    .accessibilityLabel("Your name")
                    .focused($focusedField, equals: .name)
                    .submitLabel(.done)
                    .onSubmit {
                        if store.canAddEntry {
                            Task { await store.addEntry() }
                        }
                    }
            }
        }
        .disabled(store.isStarting || store.addEntryLoading || store.hasSubmitted)
        Section {
            HStack(spacing: 12) {
                FormButton(title: store.hasSubmitted ? "Submitted!" : "Add Answer", busyTitle: "Saving...",
                           isBusy: store.addEntryLoading) {
                    Task { await store.addEntry() }
                }
                .disabled(!store.canAddEntry)
                if store.isHost {
                    FormButton(title: "Start", busyTitle: "Starting...", isBusy: store.isStarting, tint: .green) {
                        store.showStartConfirm = true
                    }
                    .disabled(!store.canStart)
                }
            }
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
            if store.isHost {
                Picker("Turn timer", selection: $store.turnSecondsChoice) {
                    Text("Off").tag(0)
                    Text("30 seconds").tag(30)
                    Text("1 minute").tag(60)
                    Text("1 minute 30").tag(90)
                    Text("2 minutes").tag(120)
                }
                .disabled(store.isStarting)
            } else {
                Text("Waiting for the host to start the game.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .listSectionSpacing(.compact)
    }

    @ViewBuilder private func recapSection(_ recap: (mostGuesses: String, leader: String)) -> some View {
        Section("Round Recap") {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("Most guesses:")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text(recap.mostGuesses)
                        .font(.subheadline.bold())
                }
                HStack {
                    Text("Overall leader:")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text(recap.leader)
                        .font(.subheadline.bold())
                }
                if let shareText = store.shareableRecapText {
                    ShareLink(item: shareText) {
                        Label("Share Recap", systemImage: "square.and.arrow.up")
                            .font(.footnote)
                    }
                    .padding(.top, 4)
                }
            }
            .padding(.vertical, 4)
        }
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
            if let line = store.lobbyAnswersLine {
                Text(line)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            // Before the start only my own answers are listed; everyone else shows up in the lobby line.
            ForEach(Array(store.sortedEntriesForDisplay.filter { store.started || $0.mine }.enumerated()),
                    id: \.element.id) { index, entry in
                if store.started {
                    Button { store.guessingEntry = entry } label: {
                        HStack {
                            Text(entry.text)
                                .foregroundStyle(entry.guessed ? .secondary : .primary)
                            Spacer()
                            if entry.guessed {
                                Text(entry.authorName ?? "")
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
                    .modifier(RevealModifier(index: index))
                } else if entry.mine {
                    // Pre-game: my own entry is visible to me only
                    VStack(alignment: .leading, spacing: 6) {
                        if editingEntryId == entry.entryId {
                            TextField("Edit answer", text: $editingEntryText)
                                .textFieldStyle(.roundedBorder)
                            HStack {
                                Button("Save") {
                                    Task {
                                        await store.editEntry(entryId: entry.entryId, text: editingEntryText)
                                        editingEntryId = nil
                                    }
                                }
                                .font(.caption.bold())
                                Button("Cancel") { editingEntryId = nil }
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        } else {
                            Text(entry.text)
                                .fontWeight(.semibold)
                                .foregroundStyle(.blue)
                            HStack {
                                Text("Your submission, not viewable to others yet")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                                Spacer()
                                Button("Edit") {
                                    editingEntryText = entry.text
                                    editingEntryId = entry.entryId
                                }
                                .font(.caption)
                                Button("Remove", role: .destructive) {
                                    Task { await store.withdrawEntry(entryId: entry.entryId) }
                                }
                                .font(.caption)
                            }
                        }
                    }
                    .swipeActions {
                        Button("Remove", role: .destructive) {
                            Task { await store.withdrawEntry(entryId: entry.entryId) }
                        }
                        Button("Edit") {
                            editingEntryText = entry.text
                            editingEntryId = entry.entryId
                        }
                        .tint(.blue)
                    }
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
        VStack(spacing: 8) {
            ForEach(store.toasts) { toast in
                ToastView(toast: toast)
                    .onTapGesture { store.dismissToast(toast.id) }
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .id(toast.id)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .animation(.spring(duration: 0.35, bounce: 0), value: store.toasts)
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
