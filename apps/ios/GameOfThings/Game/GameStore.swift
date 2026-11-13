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
    private(set) var turnOrder: [String] = [] { didSet { publishActivity() } }
    private(set) var players: [String] = [] { didSet { publishActivity() } }
    /// Who has answered so far, for the lobby line before the game starts.
    private(set) var answeredNames: [String] = []
    var currentPlayer: String? { turnOrder.first }
    /// When the current turn is due, on this device's clock; nil with no timer (#72). Nothing
    /// happens at the deadline: the view shows 0:00 and nudges the player.
    private(set) var turnEndsAt: Date?
    /// Seconds per turn the host picked for the next start; 0 is off.
    var turnSecondsChoice = 0
    private(set) var started = false { didSet { publishActivity() } }
    /// The server has no game with this code (404); polling stops and the view shows a way back.
    private(set) var gameNotFound = false

    static let maxNameLength = 30
    static let maxAnswerLength = 200

    var entryText = "" {
        didSet {
            if entryText.count > Self.maxAnswerLength { entryText = String(entryText.prefix(Self.maxAnswerLength)) }
        }
    }
    var authorName: String {
        didSet {
            if authorName.count > Self.maxNameLength { authorName = String(authorName.prefix(Self.maxNameLength)) }
            if !authorName.trimmed.isEmpty { defaults.set(authorName, forKey: Self.authorNameKey) }
            publishActivity()
        }
    }
    /// Whether this game may send this device "it's your turn" notifications (#71). On until turned off.
    private(set) var notificationsEnabled: Bool
    var newQuestion = ""
    /// This device already answered the current round's question.
    private(set) var hasSubmitted: Bool {
        didSet { defaults.set(hasSubmitted, forKey: submittedKey) }
    }

    private(set) var hostName: String?
    private(set) var isStarting = false
    private(set) var transferHostLoading = false
    private(set) var addEntryLoading = false
    private(set) var startNewRoundLoading = false
    private(set) var guessLoading = false
    var guessingEntry: Entry?
    var showStartConfirm = false
    private(set) var toasts: [Toast] = []
    var toast: Toast? { toasts.last }
    private(set) var roundStartScores: [String: Int] = [:]
    private(set) var isConnected = true
    /// Bumped whenever anyone in the room guesses right / wrong; drives confetti and haptics.
    private(set) var correctGuessCount = 0
    private(set) var wrongGuessCount = 0

    @ObservationIgnored private let api: APIClient
    @ObservationIgnored private let realtime: RealtimeClient
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let push: PushRegistrar
    @ObservationIgnored private let liveActivity: (any TurnActivityPublishing)?
    @ObservationIgnored private var lastActivity: TurnActivityState?
    @ObservationIgnored private var pollTask: Task<Void, Never>?
    @ObservationIgnored private var toastTask: Task<Void, Never>?
    // Overlapping fetches (socket bursts, polling) apply only the newest response.
    @ObservationIgnored private var entriesRequest = 0
    @ObservationIgnored private var scoresRequest = 0

    private var submittedKey: String { "submitted_\(gameId)" }
    private var notificationsKey: String { "pushEnabled_\(gameId)" }

    init(gameId: String, api: APIClient = APIClient(), realtime: RealtimeClient = RealtimeClient(),
         defaults: UserDefaults = .standard, push: PushRegistrar = .shared,
         liveActivity: (any TurnActivityPublishing)? = nil) {
        self.gameId = gameId
        self.api = api
        self.realtime = realtime
        self.defaults = defaults
        self.push = push
        self.liveActivity = liveActivity
        authorName = defaults.string(forKey: Self.authorNameKey) ?? ""
        hasSubmitted = defaults.bool(forKey: "submitted_\(gameId)")
        notificationsEnabled = defaults.object(forKey: "pushEnabled_\(gameId)") as? Bool ?? true
    }

    // MARK: - Lifecycle

    func start() {
        realtime.onConnectionChange = { [weak self] in self?.connectionChanged($0) }
        realtime.onEvent = { [weak self] in self?.handle(event: $0, payload: $1) }
        liveActivity?.onPushToken = { [weak self] token in
            guard let self else { return }
            Task { await self.registerDevice(activityToken: token) }
        }
        realtime.connect()
        Task {
            await sync()
            await registerDevice()
        }
    }

    func stop() {
        realtime.disconnect()
        stopPolling()
        toastTask?.cancel()
        liveActivity?.publish(nil)
        lastActivity = nil
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
        guard !gameNotFound else { return }
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
            // The lobby's "Answers in" names come from the game, not the entries.
            if !started { Task { await fetchGame() } }
        case "gameStarted":
            let started = decode(GameStartedEvent.self)
            turnOrder = started?.turnOrder ?? []
            applyTurnTimer(deadline: started?.turnDeadline, serverTime: started?.serverTime)
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
                applyTurnTimer(deadline: data.turnDeadline, serverTime: data.serverTime)
            }
        case "hostTransferred":
            if let data = decode(HostTransferredEvent.self) {
                hostName = data.newHostName
                let isMe = authorName.trimmingCharacters(in: .whitespacesAndNewlines).caseInsensitiveCompare(data.newHostName.trimmingCharacters(in: .whitespacesAndNewlines)) == .orderedSame
                if isMe {
                    defaults.set(data.hostToken, forKey: APIClient.hostTokenKey(gameId))
                    show("You are now the host!")
                } else {
                    defaults.removeObject(forKey: APIClient.hostTokenKey(gameId))
                    show("Host duties transferred to \(data.newHostName)")
                }
            }
        default:
            break
        }
    }

    // MARK: - Notifications and Live Activity (#71)

    /// The Live Activity while I'm playing this round: whose turn it is and who is left. Nil (no
    /// activity) before the start, for spectators, and once the round is over.
    private var activityState: TurnActivityState? {
        guard started, !turnOrder.isEmpty, players.contains(authorName) else { return nil }
        return TurnActivityState(gameId: gameId, playerName: authorName,
                                 content: .init(currentPlayer: turnOrder.first, remaining: turnOrder))
    }

    private func publishActivity() {
        let state = activityState
        guard state != lastActivity else { return }
        lastActivity = state
        liveActivity?.publish(state)
    }

    /// Tells the server where to notify me, once I've answered (that is what claims my name) and
    /// this game's notifications are on. Safe to call whenever something it needs changes.
    func registerDevice(activityToken: String? = nil) async {
        let name = authorName.trimmed
        let pushToken = push.deviceToken
        guard notificationsEnabled, hasSubmitted, !name.isEmpty, pushToken != nil || activityToken != nil else { return }
        try? await api.registerDevice(gameId: gameId, playerName: name, pushToken: activityToken == nil ? pushToken : nil,
                                      activityToken: activityToken, sandbox: PushRegistrar.isSandbox)
    }

    /// The toggle in the game screen. Off also removes this device from the game on the server.
    func setNotifications(enabled: Bool) async {
        notificationsEnabled = enabled
        defaults.set(enabled, forKey: notificationsKey)
        if enabled {
            guard await push.requestAndRegister() else {
                notificationsEnabled = false
                defaults.set(false, forKey: notificationsKey)
                show("Turn notifications are turned off for Game of Things in Settings", .error)
                return
            }
            await registerDevice()
        } else if hasSubmitted {
            try? await api.removeDevice(gameId: gameId, playerName: authorName.trimmed)
        }
    }

    // MARK: - Fetching

    func sync() async {
        guard !gameNotFound else { return }
        async let game: Void = fetchGame()
        async let entries: Void = fetchEntries()
        async let scores: Void = fetchScores()
        _ = await (game, entries, scores)
    }

    private func fetchGame() async {
        let game: Game
        do {
            game = try await api.game(gameId)
        } catch let error as APIError where error.status == 404 {
            // A missing game won't appear by retrying, so stop polling for it.
            gameNotFound = true
            stopPolling()
            removeFromRecentGames()
            return
        } catch {
            return
        }
        gameQuestion = game.question
        gameTitle = game.title
        if let started = game.started {
            self.started = started
        }
        if let host = game.hostName {
            hostName = host
        }
        if let order = game.turnOrder {
            turnOrder = order
        }
        applyTurnTimer(deadline: game.turnDeadline, serverTime: game.serverTime)
        if let players = game.players {
            self.players = players
        }
        answeredNames = game.answeredNames ?? []
        saveToRecentGames(title: gameTitle)
    }

    private func applyTurnTimer(deadline: Double?, serverTime: Double?) {
        turnEndsAt = Self.localDeadline(turnDeadline: deadline, serverTime: serverTime)
    }

    /// The server sends its own clock with a deadline, so the time left is measured against that
    /// and a skewed device clock can't change it. Nil when the game has no timer.
    static func localDeadline(turnDeadline: Double?, serverTime: Double?, now: Date = .now) -> Date? {
        guard let turnDeadline, let serverTime else { return nil }
        return now.addingTimeInterval((turnDeadline - serverTime) / 1000)
    }

    private func saveToRecentGames(title: String?) {
        RecentGamesStore.record(gameId: gameId, title: title, defaults: defaults)
    }

    private func removeFromRecentGames() {
        RecentGamesStore.remove(gameId: gameId, defaults: defaults)
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
        if started && roundStartScores.isEmpty {
            var map: [String: Int] = [:]
            for s in scores { map[s.playerName] = s.score }
            roundStartScores = map
        }
    }

    // MARK: - Actions

    var canAddEntry: Bool {
        !entryText.trimmed.isEmpty && !authorName.trimmed.isEmpty
            && !started && !isStarting && !addEntryLoading && !hasSubmitted
    }

    /// Only the device that created the game holds its host token (web: getHostToken(gameId) !== null).
    var isHost: Bool { defaults.string(forKey: APIClient.hostTokenKey(gameId)) != nil }

    var canStart: Bool { isHost && !entries.isEmpty && !started && !isStarting }

    func addEntry() async {
        guard canAddEntry else { return }
        // Names are matched exactly against turn order, so never store stray whitespace.
        authorName = authorName.trimmed
        addEntryLoading = true
        defer { addEntryLoading = false }
        do {
            try await api.addEntry(gameId: gameId, authorName: authorName, text: entryText.trimmed)
            entryText = ""
            await fetchEntries()
            hasSubmitted = true
            show("Entry added!")
            // My name is claimed now, so this is the moment to ask for notifications
            if notificationsEnabled, await push.requestAndRegister() { await registerDevice() }
        } catch {
            if let message = (error as? APIError)?.serverMessage {
                show(message, .error)
            } else {
                show("Failed to add entry", .error)
            }
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
            let order = try await api.startGame(gameId, turnSeconds: turnSecondsChoice > 0 ? turnSecondsChoice : nil)
            started = true
            if !order.isEmpty {
                turnOrder = order
            }
            if turnSecondsChoice > 0 { await fetchGame() } // the first deadline
            await fetchEntries()
            await fetchScores()
        } catch let error as APIError where error.status == 409 {
            show("Game already started! Refreshing...")
            await sync()
        } catch let error as APIError where error.status == 403 {
            show("Only the host can start the game", .error)
        } catch {
            show((error as? APIError)?.serverMessage ?? "Failed to start game", .error)
        }
    }

    func startNewRound() async {
        let question = newQuestion.trimmed
        guard isHost, !question.isEmpty, !startNewRoundLoading else { return }
        startNewRoundLoading = true
        defer { startNewRoundLoading = false }
        do {
            try await api.resetGame(gameId, question: question)
            newQuestion = ""
            entries = []
            started = false
            roundStartScores = [:]
            players = []
            answeredNames = []
        } catch let error as APIError where error.status == 403 {
            show("Only the host can start a new round", .error)
        } catch {
            show("Failed to start new round", .error)
        }
    }

    func editEntry(entryId: String, text: String) async {
        do {
            try await api.editEntry(gameId: gameId, entryId: entryId, text: text)
            await fetchEntries()
            show("Answer updated!")
        } catch {
            show((error as? APIError)?.serverMessage ?? "Failed to update answer", .error)
        }
    }

    func withdrawEntry(entryId: String) async {
        do {
            try await api.deleteEntry(gameId: gameId, entryId: entryId)
            hasSubmitted = false
            await fetchEntries()
            show("Answer removed!")
        } catch {
            show((error as? APIError)?.serverMessage ?? "Failed to remove answer", .error)
        }
    }

    func skipTurn() async {
        guard isHost, started else { return }
        do {
            let order = try await api.skipTurn(gameId)
            if !order.isEmpty { turnOrder = order }
            show("Turn skipped")
        } catch {
            show((error as? APIError)?.serverMessage ?? "Failed to skip turn", .error)
        }
    }

    func removePlayer(_ name: String) async {
        guard isHost, started else { return }
        do {
            let order = try await api.removePlayer(gameId: gameId, playerName: name)
            if !order.isEmpty { turnOrder = order }
            show("Removed \(name)")
        } catch {
            show((error as? APIError)?.serverMessage ?? "Failed to remove player", .error)
        }
    }

    /// Other players in the room who can receive host duties.
    var otherPlayers: [String] {
        var names = Set<String>()
        for e in entries { if let n = e.authorName, !n.isEmpty { names.insert(n) } }
        for t in turnOrder { if !t.isEmpty { names.insert(t) } }
        for s in scores { if !s.playerName.isEmpty { names.insert(s.playerName) } }
        names.remove(authorName)
        return names.sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    func transferHost(to targetPlayerName: String) async -> Bool {
        guard isHost, !targetPlayerName.trimmed.isEmpty, !transferHostLoading else { return false }
        transferHostLoading = true
        defer { transferHostLoading = false }
        do {
            try await api.transferHost(gameId: gameId, targetPlayerName: targetPlayerName.trimmed)
            return true
        } catch {
            show((error as? APIError)?.serverMessage ?? error.localizedDescription, .error)
            return false
        }
    }

    func guess(_ entry: Entry, author: String) async {
        guard !guessLoading else { return }
        guessLoading = true
        defer {
            guessLoading = false
            guessingEntry = nil
        }
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
            show((error as? APIError)?.serverMessage ?? "Error submitting guess", .error)
            if (error as? APIError)?.status == 409 { await fetchEntries() }
        }
    }

    // MARK: - Toasts

    func show(_ message: String, _ style: Toast.Style = .success, for duration: Duration? = .seconds(5)) {
        let newToast = Toast(message: message, style: style, duration: duration)
        toasts.append(newToast)
        if toasts.count > 3 {
            toasts.removeFirst(toasts.count - 3)
        }
        guard let duration else { return }
        Task { [weak self] in
            try? await Task.sleep(for: duration)
            guard !Task.isCancelled else { return }
            self?.dismissToast(newToast.id)
        }
    }

    func dismissToast(_ id: UUID? = nil) {
        if let id {
            toasts.removeAll { $0.id == id }
        } else if !toasts.isEmpty {
            toasts.removeFirst()
        }
    }

    // MARK: - Derived state

    var roundRecapText: (mostGuesses: String, leader: String)? {
        guard allGuessed, !scores.isEmpty else { return nil }
        let gains = scores.map { score in
            let start = roundStartScores[score.playerName] ?? 0
            return (name: score.playerName, gained: max(0, score.score - start))
        }
        let maxGained = gains.map(\.gained).max() ?? 0
        let top = gains.filter { $0.gained == maxGained && $0.gained > 0 }
        let highestScore = scores.map(\.score).max() ?? 0
        let leaders = scores.filter { $0.score == highestScore }

        let mostText = top.isEmpty ? "None" : top.map { "\($0.name) (\($0.gained))" }.joined(separator: ", ")
        let leaderText = leaders.map { "\($0.playerName) (\($0.score))" }.joined(separator: ", ")
        return (mostText, leaderText)
    }

    /// Formatted recap text for sharing.
    var shareableRecapText: String? {
        guard let recap = roundRecapText else { return nil }
        var lines = ["Game of Things - Round Recap"]
        if let q = gameQuestion, !q.isEmpty { lines.append("Question: \"\(q)\"") }
        lines.append("🎯 Most guesses: \(recap.mostGuesses)")
        lines.append("🏆 Overall leader: \(recap.leader)")
        return lines.joined(separator: "\n")
    }

    /// Revealed answers alphabetically; before the reveal, in submission order.
    var sortedEntriesForDisplay: [Entry] {
        started
            ? entries.sorted { $0.text.localizedCompare($1.text) == .orderedAscending }
            : entries.sorted { $0.createdAt < $1.createdAt }
    }

    /// Authors are only revealed once their entry is guessed.
    var guessedNames: [String] { Set(entries.filter(\.guessed).compactMap(\.authorName)).sorted() }
    var notGuessedNames: [String] {
        let guessed = Set(guessedNames)
        return Set(players).subtracting(guessed).sorted()
    }
    /// "Answers in (3): Alice, Bob, Carol" before the game starts; nil once started or when nobody has answered.
    var lobbyAnswersLine: String? {
        guard !started, !answeredNames.isEmpty else { return nil }
        return "Answers in (\(answeredNames.count)): \(answeredNames.joined(separator: ", "))"
    }
    var allGuessed: Bool { !entries.isEmpty && entries.allSatisfy(\.guessed) }
    var isLastEntry: Bool { entries.filter { !$0.guessed }.count == 1 }
    var isMyTurn: Bool { currentPlayer != nil && currentPlayer == authorName }

    /// Everyone who answered this round (from GET game once started), for the guess picker.
    var uniqueNames: [String] { players }

    /// You can't guess your own answer unless it's the last one left (a free point to end the round).
    func canGuess(_ entry: Entry) -> Bool {
        isMyTurn && !entry.guessed && !(entry.mine && !isLastEntry)
    }

    /// Whether this name can be picked as the author: not fully guessed, and not yourself until you're the last player left.
    func canPick(_ name: String) -> Bool {
        !isFullyGuessed(name) && !(name == authorName && turnOrder.count > 1)
    }

    /// Each player writes one answer per round and the server only reveals an author once their
    /// answer is guessed, so a name is fully guessed exactly when it appears among guessed authors.
    func isFullyGuessed(_ name: String) -> Bool {
        guessedNames.contains(name)
    }
}
