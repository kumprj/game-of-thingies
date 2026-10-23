import Foundation
import Observation

struct Toast: Equatable, Identifiable {
    enum Style { case success, error }

    let id = UUID()
    let message: String
    let style: Style
    /// `nil` stays up until replaced.
    let duration: Duration?
}

/// Port of client/src/hooks/useGameLogic.ts plus the submitted-answer lock from
/// StartGamePage.tsx: all state and actions for one game room.
@Observable
final class GameStore {
    static let authorNameKey = "got_authorName"

    let gameId: String

    private(set) var gameTitle: String?
    private(set) var gameQuestion: String?
    private(set) var entries: [Entry] = []
    private(set) var scores: [Score] = []
    private(set) var turnOrder: [String] = []
    private(set) var currentPlayer: String?
    private(set) var started = false

    var entryText = ""
    var authorName: String {
        didSet {
            if !authorName.trimmed.isEmpty { defaults.set(authorName, forKey: Self.authorNameKey) }
        }
    }
    var newQuestion = ""
    /// This device already answered the current round's question.
    private(set) var hasSubmitted: Bool {
        didSet { defaults.set(hasSubmitted, forKey: submittedKey) }
    }

    private(set) var isStarting = false
    private(set) var addEntryLoading = false
    private(set) var startNewRoundLoading = false
    private(set) var guessLoading = false
    var guessingEntry: Entry?
    var showStartConfirm = false
    private(set) var toast: Toast?
    private(set) var isConnected = true
    /// Bumped whenever anyone in the room guesses right / wrong; drives confetti and haptics.
    private(set) var correctGuessCount = 0
    private(set) var wrongGuessCount = 0

    @ObservationIgnored private let api: APIClient
    @ObservationIgnored private let realtime: RealtimeClient
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private var pollTask: Task<Void, Never>?
    @ObservationIgnored private var toastTask: Task<Void, Never>?
    // Overlapping fetches (socket bursts, polling) apply only the newest response.
    @ObservationIgnored private var entriesRequest = 0
    @ObservationIgnored private var scoresRequest = 0

    private var submittedKey: String { "submitted_\(gameId)" }

    init(gameId: String, api: APIClient = APIClient(), realtime: RealtimeClient = RealtimeClient(),
         defaults: UserDefaults = .standard) {
        self.gameId = gameId
        self.api = api
        self.realtime = realtime
        self.defaults = defaults
        authorName = defaults.string(forKey: Self.authorNameKey) ?? ""
        hasSubmitted = defaults.bool(forKey: "submitted_\(gameId)")
    }

    // MARK: - Lifecycle

    func start() {
        realtime.onConnectionChange = { [weak self] in self?.connectionChanged($0) }
        realtime.onEvent = { [weak self] in self?.handle(event: $0, payload: $1) }
        realtime.connect()
        Task { await sync() }
    }

    func stop() {
        realtime.disconnect()
        stopPolling()
        toastTask?.cancel()
    }

    /// iOS suspends sockets in the background, so drop it there and reconnect on return.
    func enterBackground() {
        realtime.disconnect()
        stopPolling()
    }

    func enterForeground() {
        realtime.connect()
        if !isConnected { startPolling() }
        Task { await sync() }
    }

    private func connectionChanged(_ connected: Bool) {
        if connected {
            // Rooms don't survive reconnects, so rejoin every time, then catch up on anything missed.
            realtime.emit("joinGame", gameId)
            Task { await sync() }
            if !isConnected {
                isConnected = true
                stopPolling()
                show("Connected!", for: .seconds(2))
            }
        } else if isConnected {
            isConnected = false
            show("Reconnecting...", .error, for: nil)
            startPolling()
        }
    }

    private func startPolling() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(3))
                guard !Task.isCancelled else { return }
                await self?.sync()
            }
        }
    }

    private func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    // MARK: - Socket events

    func handle(event: String, payload: Data?) {
        func decode<T: Decodable>(_ type: T.Type) -> T? {
            payload.flatMap { try? JSONDecoder().decode(T.self, from: $0) }
        }

        switch event {
        case "entriesUpdated":
            Task { await fetchEntries() }
        case "gameStarted":
            let order = decode(GameStartedEvent.self)?.turnOrder ?? []
            turnOrder = order
            currentPlayer = order.first
            Task { await sync() }
            show("‼️ The game has started ‼️")
        case "wrongAnswer":
            let data = decode(GuessEvent.self)
            wrongGuessCount += 1
            show("❌ \(data?.playerName ?? "Someone") guessed wrong for '\(data?.guess ?? "")'!", .error, for: .seconds(3))
            Task { await fetchEntries() }
        case "gameReset":
            hasSubmitted = false
            Task { await sync() }
            show("‼️ A new question has been asked – add your answer")
        case "scoreUpdated":
            let data = decode(GuessEvent.self)
            correctGuessCount += 1
            show("🎉 \(data?.playerName ?? "Someone") got it right! The answer was '\(data?.guess ?? "")', written by \(data?.authorName ?? "")",
                 for: .seconds(7))
            Task { await fetchScores() }
        case "nextTurn":
            if let data = decode(NextTurnEvent.self) {
                turnOrder = data.turnOrder
                currentPlayer = data.currentPlayer
            }
        default:
            break
        }
    }

    // MARK: - Fetching

    func sync() async {
        async let game: Void = fetchGame()
        async let entries: Void = fetchEntries()
        async let scores: Void = fetchScores()
        _ = await (game, entries, scores)
    }

    private func fetchGame() async {
        guard let game = try? await api.game(gameId) else { return }
        gameQuestion = game.question
        gameTitle = game.gameOwner
        if let order = game.turnOrder {
            turnOrder = order
            currentPlayer = order.first
        }
    }

    private func fetchEntries() async {
        entriesRequest += 1
        let request = entriesRequest
        guard let fetched = try? await api.entries(gameId), request == entriesRequest else { return }
        entries = fetched.sorted { $0.text.localizedCaseInsensitiveCompare($1.text) == .orderedAscending }
        started = entries.contains { $0.revealed }
    }

    private func fetchScores() async {
        scoresRequest += 1
        let request = scoresRequest
        guard let fetched = try? await api.scores(gameId), request == scoresRequest else { return }
        scores = fetched.sorted { $0.score > $1.score }
    }

    // MARK: - Actions

    var canAddEntry: Bool {
        !entryText.trimmed.isEmpty && !authorName.trimmed.isEmpty
            && !started && !isStarting && !addEntryLoading && !hasSubmitted
    }

    var canStart: Bool { !entries.isEmpty && !started && !isStarting }

    func addEntry() async {
        guard canAddEntry else { return }
        // Names are matched exactly against turn order, so never store stray whitespace.
        authorName = authorName.trimmed
        addEntryLoading = true
        defer { addEntryLoading = false }
        let began = ContinuousClock.now
        do {
            try await api.addEntry(gameId: gameId, authorName: authorName, text: entryText.trimmed)
            entryText = ""
            await fetchEntries()
            // Keep the spinner up long enough to register
            let elapsed = ContinuousClock.now - began
            if elapsed < .seconds(1) { try? await Task.sleep(for: .seconds(1) - elapsed) }
            hasSubmitted = true
            show("Entry added!")
        } catch {
            show("Failed to add entry", .error)
        }
    }

    func startGame() async {
        guard !entries.isEmpty else {
            show("Add some entries first!", .error)
            return
        }
        isStarting = true
        defer { isStarting = false }
        do {
            try await api.startGame(gameId)
            started = true
            await fetchEntries()
            await fetchScores()
        } catch let error as APIError where error.status == 409 {
            show("Game already started! Refreshing...")
            await sync()
        } catch {
            show("Failed to start game", .error)
        }
    }

    func startNewRound() async {
        let question = newQuestion.trimmed
        guard !question.isEmpty, !startNewRoundLoading else { return }
        startNewRoundLoading = true
        defer { startNewRoundLoading = false }
        do {
            try await api.resetGame(gameId, question: question)
            newQuestion = ""
            entries = []
            started = false
        } catch {
            show("Failed to start new round", .error)
        }
    }

    func guess(_ entry: Entry, author: String) async {
        guard !guessLoading else { return }
        guessLoading = true
        defer {
            guessLoading = false
            guessingEntry = nil
        }
        try? await Task.sleep(for: .seconds(1.5)) // suspense, as on the web
        do {
            let correct = try await api.guess(gameId: gameId, entryId: entry.entryId,
                                              guesserName: authorName, guess: author)
            if correct {
                show("Correct!")
                await fetchEntries()
                await fetchScores()
            } else {
                show("Wrong answer!", .error, for: .seconds(7))
            }
        } catch {
            show("Error submitting guess", .error)
        }
    }

    // MARK: - Toasts

    func show(_ message: String, _ style: Toast.Style = .success, for duration: Duration? = .seconds(5)) {
        let toast = Toast(message: message, style: style, duration: duration)
        self.toast = toast
        toastTask?.cancel()
        guard let duration else { return }
        toastTask = Task { [weak self] in
            try? await Task.sleep(for: duration)
            guard !Task.isCancelled, self?.toast?.id == toast.id else { return }
            self?.toast = nil
        }
    }

    func dismissToast() {
        toastTask?.cancel()
        toast = nil
    }

    // MARK: - Derived state

    /// Revealed answers alphabetically; before the reveal, in submission order.
    var sortedEntriesForDisplay: [Entry] {
        started
            ? entries.sorted { $0.text.localizedCompare($1.text) == .orderedAscending }
            : entries.sorted { $0.createdAt < $1.createdAt }
    }

    var guessedNames: [String] { Set(entries.filter(\.guessed).map(\.authorName)).sorted() }
    var notGuessedNames: [String] { Set(entries.filter { !$0.guessed }.map(\.authorName)).sorted() }
    var allGuessed: Bool { !entries.isEmpty && entries.allSatisfy(\.guessed) }
    var isLastEntry: Bool { entries.filter { !$0.guessed }.count == 1 }
    var isMyTurn: Bool { currentPlayer != nil && currentPlayer == authorName }

    /// Authors in list order, for the guess picker.
    var uniqueNames: [String] {
        var seen = Set<String>()
        return entries.map(\.authorName).filter { seen.insert($0).inserted }
    }

    /// You can't guess your own answer unless it's the last one left (a free point to end the round).
    func canGuess(_ entry: Entry) -> Bool {
        isMyTurn && !entry.guessed && !(entry.authorName == authorName && !isLastEntry)
    }

    /// Every answer by this author has already been guessed.
    func isFullyGuessed(_ name: String) -> Bool {
        entries.filter { $0.authorName == name }.allSatisfy(\.guessed)
    }
}
