import Foundation
import Testing
@testable import GameOfThings

/// Drives GameStore against canned server responses (StubURLProtocol) and injected socket events.
extension StubbedNetworkTests {
@Suite(.serialized)
struct GameStoreTests {
    let defaults: UserDefaults
    let api: APIClient

    init() {
        let d = UserDefaults(suiteName: "GameStoreTests")!
        d.removePersistentDomain(forName: "GameStoreTests")
        defaults = d
        api = APIClient(baseURL: URL(string: "http://test.local")!, session: StubURLProtocol.session(), defaults: d)
        StubURLProtocol.requests = []
    }

    private func makeStore(me: String = "Ann", entries: String = "[]", game: String = "{}", scores: String = "[]") async -> GameStore {
        StubURLProtocol.respond = { request in
            switch (request.httpMethod, request.url!.path) {
            case ("GET", "/api/games/ABCD"): (200, game)
            case ("GET", "/api/games/ABCD/entries"): (200, entries)
            case ("GET", "/api/games/ABCD/scores"): (200, scores)
            default: (200, "{}")
            }
        }
        defaults.set(me, forKey: GameStore.authorNameKey)
        let store = GameStore(gameId: "ABCD", api: api, realtime: RealtimeClient(baseURL: api.baseURL), defaults: defaults)
        await store.sync()
        return store
    }

    private static func entry(_ id: String, _ author: String, _ text: String, revealed: Bool = true,
                              guessed: Bool = false, mine: Bool = false, createdAt: String = "2026-01-01T00:00:00Z") -> String {
        #"{"entryId":"\#(id)","authorName":"\#(author)","text":"\#(text)","createdAt":"\#(createdAt)","revealed":\#(revealed),"guessed":\#(guessed),"mine":\#(mine)}"#
    }

    @Test func syncLoadsGameAndDerivesTurn() async {
        let store = await makeStore(
            entries: "[\(Self.entry("1", "Bo", "zebra")),\(Self.entry("2", "Ann", "Apple"))]",
            game: #"{"title":"Friday","question":"Q?","turnOrder":["Ann","Bo"]}"#,
            scores: #"[{"playerName":"Bo","score":1},{"playerName":"Ann","score":3}]"#)
        #expect(store.gameTitle == "Friday")
        #expect(store.gameQuestion == "Q?")
        #expect(store.started)
        #expect(store.isMyTurn)
        #expect(store.sortedEntriesForDisplay.map(\.text) == ["Apple", "zebra"])
        #expect(store.scores.map(\.playerName) == ["Ann", "Bo"])
    }

    @Test func isHostFollowsStoredToken() async {
        let store = await makeStore(entries: "[\(Self.entry("1", "Bo", "a", revealed: false))]")
        #expect(!store.isHost)
        #expect(!store.canStart)
        defaults.set("tok", forKey: "hostToken.ABCD")
        #expect(store.isHost)
        #expect(store.canStart)
    }

    @Test func startGameForbiddenShowsErrorToast() async {
        let store = await makeStore(entries: "[\(Self.entry("1", "Bo", "a", revealed: false))]")
        defaults.set("bad", forKey: "hostToken.ABCD")
        StubURLProtocol.respond = { _ in (403, #"{"error":"Forbidden"}"#) }
        await store.startGame()
        #expect(store.toast?.style == .error)
        #expect(store.toast?.message == "Only the host can start the game")
        #expect(!store.started)
    }

    @Test func startGameConflictTreatedAsAlreadyStarted() async {
        let store = await makeStore(entries: "[\(Self.entry("1", "Bo", "a", revealed: false))]")
        defaults.set("tok", forKey: "hostToken.ABCD")
        StubURLProtocol.respond = { request in
            request.httpMethod == "POST" ? (409, #"{"error":"Already started"}"#) : (200, "[]")
        }
        await store.startGame()
        #expect(store.toast?.style == .success)
        #expect(store.toast?.message == "Game already started! Refreshing...")
    }

    @Test func startNewRoundForbiddenShowsErrorToast() async {
        let store = await makeStore(entries: "[\(Self.entry("1", "Bo", "a"))]")
        defaults.set("bad", forKey: "hostToken.ABCD")
        store.newQuestion = "Next?"
        StubURLProtocol.respond = { _ in (403, #"{"error":"Forbidden"}"#) }
        await store.startNewRound()
        #expect(store.toast?.message == "Only the host can start a new round")
        #expect(store.toast?.style == .error)
    }

    @Test func startNewRoundIgnoredForNonHost() async {
        let store = await makeStore(entries: "[\(Self.entry("1", "Bo", "a"))]")
        store.newQuestion = "Next?"
        StubURLProtocol.requests = []
        await store.startNewRound()
        #expect(StubURLProtocol.requests.isEmpty)
    }

    @Test func pregameListsInSubmissionOrder() async {
        let store = await makeStore(entries: """
            [\(Self.entry("1", "Bo", "a", revealed: false, createdAt: "2026-01-01T00:00:02Z")),
             \(Self.entry("2", "Cy", "b", revealed: false, createdAt: "2026-01-01T00:00:01Z"))]
            """)
        #expect(!store.started)
        #expect(store.sortedEntriesForDisplay.map(\.authorName) == ["Cy", "Bo"])
        #expect(!store.canStart) // not the host
    }

    @Test func ownAnswerIsGuessableOnlyWhenLast() async {
        let store = await makeStore(entries: "[\(Self.entry("1", "Ann", "mine", mine: true)),\(Self.entry("2", "Bo", "his"))]",
                                    game: #"{"turnOrder":["Ann","Bo"],"players":["Ann","Bo"]}"#)
        let mine = store.entries.first { $0.mine }!
        let his = store.entries.first { !$0.mine }!
        #expect(!store.canGuess(mine))
        #expect(store.canGuess(his))

        let last = await makeStore(entries: "[\(Self.entry("1", "Ann", "mine", mine: true)),\(Self.entry("2", "Bo", "his", guessed: true))]",
                                   game: #"{"turnOrder":["Ann"],"players":["Ann","Bo"]}"#)
        #expect(last.canGuess(last.entries.first { $0.mine }!))
        #expect(last.isFullyGuessed("Bo"))
        #expect(last.guessedNames == ["Bo"] && last.notGuessedNames == ["Ann"])
    }

    @Test func cannotPickYourselfUntilLastPlayer() async {
        let entries = "[\(Self.entry("1", "Ann", "mine", mine: true)),\(Self.entry("2", "Bo", "his"))]"
        let store = await makeStore(entries: entries, game: #"{"turnOrder":["Ann","Bo"]}"#)
        #expect(!store.canPick("Ann"))
        #expect(store.canPick("Bo"))

        let last = await makeStore(entries: entries, game: #"{"turnOrder":["Ann"]}"#)
        #expect(last.canPick("Ann"))
    }

    @Test func nothingIsGuessableOffTurn() async {
        let store = await makeStore(entries: "[\(Self.entry("1", "Bo", "his"))]", game: #"{"turnOrder":["Bo","Ann"]}"#)
        #expect(!store.isMyTurn)
        #expect(!store.canGuess(store.entries[0]))
    }

    @Test func allGuessedEndsRound() async {
        let store = await makeStore(entries: "[\(Self.entry("1", "Bo", "x", guessed: true))]", game: #"{"turnOrder":[]}"#)
        #expect(store.allGuessed)
    }

    @Test func addEntryTrimsSubmitsAndLocks() async {
        let store = await makeStore(entries: "[]")
        store.entryText = "  Tacos "
        store.authorName = "Ann "
        await store.addEntry()
        let post = StubURLProtocol.requests.first { $0.httpMethod == "POST" }!
        #expect(post.url?.path == "/api/games/ABCD/entries")
        #expect(try! JSONDecoder().decode([String: String].self, from: post.httpBody!) == ["authorName": "Ann", "text": "Tacos"])
        #expect(store.entryText.isEmpty)
        #expect(store.hasSubmitted)
        #expect(!store.canAddEntry)
        #expect(defaults.bool(forKey: "submitted_ABCD"))
        #expect(defaults.string(forKey: GameStore.authorNameKey) == "Ann")
        #expect(store.toast?.message == "Entry added!")
    }

    @Test func secondAddEntryWhileOneIsInFlightIsIgnored() async {
        let store = await makeStore(entries: "[]")
        store.entryText = "Tacos"
        store.authorName = "Ann"
        async let first: Void = store.addEntry()
        async let second: Void = store.addEntry()
        _ = await (first, second)
        let posts = StubURLProtocol.requests.filter { $0.httpMethod == "POST" }
        #expect(posts.count == 1)
        #expect(store.toast?.message == "Entry added!")
    }

    @Test func missingGameIsFlaggedAndStopsSyncing() async {
        StubURLProtocol.respond = { _ in (404, #"{"error":"Game not found"}"#) }
        let store = GameStore(gameId: "ABCD", api: api, realtime: RealtimeClient(baseURL: api.baseURL), defaults: defaults)
        await store.sync()
        #expect(store.gameNotFound)
        StubURLProtocol.requests = []
        await store.sync()
        #expect(StubURLProtocol.requests.isEmpty)
    }

    @Test func otherFetchFailuresAreNotNotFound() async {
        StubURLProtocol.respond = { _ in (500, "{}") }
        let store = GameStore(gameId: "ABCD", api: api, realtime: RealtimeClient(baseURL: api.baseURL), defaults: defaults)
        await store.sync()
        #expect(!store.gameNotFound)
        StubURLProtocol.requests = []
        await store.sync()
        #expect(!StubURLProtocol.requests.isEmpty)
    }

    @Test func failedAddEntryDoesNotLock() async {
        let store = await makeStore(entries: "[]")
        StubURLProtocol.respond = { _ in (500, "{}") }
        store.entryText = "Tacos"
        await store.addEntry()
        #expect(!store.hasSubmitted)
        #expect(store.toast?.message == "Failed to add entry")
    }

    @Test func addEntryShowsServerErrorMessage() async {
        let store = await makeStore(entries: "[]")
        StubURLProtocol.respond = { _ in (409, #"{"error":"That name is already taken in this game"}"#) }
        store.entryText = "Tacos"
        await store.addEntry()
        #expect(!store.hasSubmitted)
        #expect(store.toast?.message == "That name is already taken in this game")
    }

    @Test func inputIsLimitedAndBlankCannotSubmit() async {
        let store = await makeStore(entries: "[]")
        store.entryText = String(repeating: "a", count: 250)
        store.authorName = String(repeating: "b", count: 40)
        #expect(store.entryText.count == GameStore.maxAnswerLength)
        #expect(store.authorName.count == GameStore.maxNameLength)
        store.entryText = "   \n "
        #expect(!store.canAddEntry)
        store.entryText = "ok"
        store.authorName = "  "
        #expect(!store.canAddEntry)
    }

    @Test func gameResetUnlocksAnswering() async {
        defaults.set(true, forKey: "submitted_ABCD")
        let store = await makeStore(entries: "[]")
        #expect(store.hasSubmitted)
        store.handle(event: "gameReset", payload: nil)
        #expect(!store.hasSubmitted)
        #expect(!defaults.bool(forKey: "submitted_ABCD"))
        #expect(store.toast?.message == "‼️ A new question has been asked – add your answer")
    }

    @Test func socketEventsUpdateTurnAndToasts() async {
        let store = await makeStore(entries: "[]")
        store.handle(event: "nextTurn", payload: Data(#"{"currentPlayer":"Ann","turnOrder":["Ann","Bo"]}"#.utf8))
        #expect(store.currentPlayer == "Ann" && store.turnOrder == ["Ann", "Bo"])

        store.handle(event: "wrongAnswer", payload: Data(#"{"playerName":"Bo","authorName":"Cy","guess":"Tacos"}"#.utf8))
        #expect(store.toast?.message == "❌ Bo guessed wrong for 'Tacos'!" && store.toast?.style == .error)
        #expect(store.wrongGuessCount == 1)

        store.handle(event: "scoreUpdated", payload: Data(#"{"playerName":"Bo","authorName":"Cy","guess":"Tacos"}"#.utf8))
        #expect(store.toast?.message == "🎉 Bo got it right! The answer was 'Tacos', written by Cy")
        #expect(store.correctGuessCount == 1)

        store.handle(event: "gameStarted", payload: Data(#"{"turnOrder":["Bo","Ann"]}"#.utf8))
        #expect(store.currentPlayer == "Bo")
        #expect(store.toast?.message == "‼️ The game has started ‼️")
    }

    @Test func correctGuessSendsGuesserAndClosesPicker() async {
        let store = await makeStore(entries: "[\(Self.entry("1", "Bo", "his"))]", game: #"{"turnOrder":["Ann","Bo"]}"#)
        let entry = store.entries[0]
        StubURLProtocol.respond = { request in
            request.url!.path.hasSuffix("/guess") ? (200, #"{"isCorrect":true}"#) : (200, "[]")
        }
        store.guessingEntry = entry
        await store.guess(entry, author: "Bo")
        let post = StubURLProtocol.requests.first { $0.url!.path.hasSuffix("/guess") }!
        #expect(try! JSONDecoder().decode([String: String].self, from: post.httpBody!) == ["guesserName": "Ann", "guess": "Bo"])
        #expect(store.toast?.message == "Correct!")
        #expect(store.guessingEntry == nil && !store.guessLoading)
    }

    @Test func startGameShowsServerMessageWhenRefused() async {
        let store = await makeStore(entries: "[\(Self.entry("1", "Bo", "a", revealed: false))]")
        defaults.set("tok", forKey: "hostToken.ABCD")
        StubURLProtocol.respond = { _ in (400, #"{"error":"Need at least 2 players to start"}"#) }
        await store.startGame()
        #expect(store.toast?.style == .error)
        #expect(store.toast?.message == "Need at least 2 players to start")
        #expect(!store.started)
    }

    @Test func refusedGuessShowsServerMessage() async {
        let store = await makeStore(entries: "[\(Self.entry("1", "Bo", "his"))]", game: #"{"turnOrder":["Ann","Bo"]}"#)
        let entry = store.entries[0]
        StubURLProtocol.respond = { request in
            request.url!.path.hasSuffix("/guess") ? (409, #"{"error":"It's not your turn"}"#) : (200, "[]")
        }
        store.guessingEntry = entry
        await store.guess(entry, author: "Bo")
        #expect(store.toast?.message == "It's not your turn" && store.toast?.style == .error)
        #expect(store.guessingEntry == nil && !store.guessLoading)
    }

    @Test func startNewRoundSendsTrimmedQuestion() async {
        let store = await makeStore(entries: "[\(Self.entry("1", "Bo", "x", guessed: true))]")
        defaults.set("tok", forKey: "hostToken.ABCD")
        store.newQuestion = "  Best pizza? "
        await store.startNewRound()
        let post = StubURLProtocol.requests.first { $0.httpMethod == "POST" }!
        #expect(post.url?.path == "/api/games/ABCD/reset")
        #expect(try! JSONDecoder().decode([String: String].self, from: post.httpBody!) == ["question": "Best pizza?"])
        #expect(store.entries.isEmpty && !store.started && store.newQuestion.isEmpty)
    }

    @Test func startGameAppliesTurnOrderFromResponse() async {
        let store = await makeStore(entries: "[\(Self.entry("1", "Bo", "a", revealed: false))]")
        defaults.set("tok", forKey: "hostToken.ABCD")
        StubURLProtocol.respond = { request in
            switch (request.httpMethod, request.url!.path) {
            case ("POST", "/api/games/ABCD/start"): (200, #"{"success":true,"turnOrder":["Bo","Ann"]}"#)
            case ("GET", _) where request.url!.path.hasSuffix("/entries"): (200, "[\(Self.entry("1", "Bo", "a", revealed: true))]")
            case ("GET", _) where request.url!.path.hasSuffix("/scores"): (200, "[]")
            default: (200, "{}")
            }
        }
        await store.startGame()
        #expect(store.started)
        #expect(store.turnOrder == ["Bo", "Ann"])
        #expect(store.currentPlayer == "Bo")
    }

    @Test func playersFromGameDriveNamesAndFullyGuessed() async {
        let store = await makeStore(
            entries: "[\(Self.entry("1", "Bo", "a", guessed: true)),\(Self.entry("2", "Cy", "b"))]",
            game: #"{"turnOrder":["Ann","Cy"],"players":["Ann","Bo","Cy"]}"#)
        #expect(store.uniqueNames == ["Ann", "Bo", "Cy"])
        #expect(store.guessedNames == ["Bo"])
        #expect(store.notGuessedNames == ["Ann", "Cy"])
        #expect(store.isFullyGuessed("Bo"))
        #expect(!store.isFullyGuessed("Cy"))
        #expect(!store.canPick("Bo"))
        #expect(store.canPick("Cy"))
    }

    @Test func lobbyLineListsWhoHasAnswered() async {
        let store = await makeStore(game: #"{"started":false,"answeredNames":["Ann","Bo","Cy"]}"#)
        #expect(store.answeredNames == ["Ann", "Bo", "Cy"])
        #expect(store.lobbyAnswersLine == "Answers in (3): Ann, Bo, Cy")
    }

    @Test func lobbyLineIsNilWhenNobodyHasAnsweredOrGameStarted() async {
        let empty = await makeStore(game: #"{"started":false,"answeredNames":[]}"#)
        #expect(empty.lobbyAnswersLine == nil)
        // fetchEntries derives `started` from revealed entries, so a started game needs one.
        let started = await makeStore(entries: "[\(Self.entry("1", "Bo", "a"))]", game: #"{"started":true,"answeredNames":["Ann"]}"#)
        #expect(started.started)
        #expect(started.lobbyAnswersLine == nil)
        let missing = await makeStore(game: #"{"started":true,"players":["Ann","Bo"]}"#)
        #expect(missing.answeredNames.isEmpty)
    }

    @Test func entriesUpdatedRefreshesLobbyNames() async {
        let store = await makeStore(game: #"{"started":false,"answeredNames":["Ann"]}"#)
        StubURLProtocol.respond = { request in
            request.url!.path == "/api/games/ABCD"
                ? (200, #"{"started":false,"answeredNames":["Ann","Bo"]}"#) : (200, "[]")
        }
        store.handle(event: "entriesUpdated", payload: nil)
        for _ in 0..<50 where store.answeredNames.count < 2 { try? await Task.sleep(for: .milliseconds(20)) }
        #expect(store.answeredNames == ["Ann", "Bo"])
    }

    @Test func hiddenAuthorsDoNotCountAsGuessed() async {
        let hidden = #"{"entryId":"1","text":"x","createdAt":"","revealed":true,"guessed":false,"mine":false}"#
        let store = await makeStore(entries: "[\(hidden)]", game: #"{"turnOrder":["Ann"],"players":["Ann","Bo"]}"#)
        #expect(store.guessedNames.isEmpty)
        #expect(store.notGuessedNames == ["Ann", "Bo"])
    }

    @Test func skipTurnAppliesTurnOrderFromResponse() async {
        let store = await makeStore(entries: "[\(Self.entry("1", "Bo", "a"))]", game: #"{"turnOrder":["Ann","Bo"]}"#)
        defaults.set("tok", forKey: "hostToken.ABCD")
        StubURLProtocol.respond = { request in
            request.url!.path.hasSuffix("/skip-turn") ? (200, #"{"success":true,"turnOrder":["Bo","Ann"]}"#) : (200, "[]")
        }
        await store.skipTurn()
        #expect(store.turnOrder == ["Bo", "Ann"])
        #expect(store.currentPlayer == "Bo")
    }

    @Test func removePlayerAppliesTurnOrderFromResponse() async {
        let store = await makeStore(entries: "[\(Self.entry("1", "Bo", "a"))]", game: #"{"turnOrder":["Ann","Bo","Cy"]}"#)
        defaults.set("tok", forKey: "hostToken.ABCD")
        StubURLProtocol.respond = { request in
            request.httpMethod == "DELETE" ? (200, #"{"success":true,"turnOrder":["Ann","Cy"]}"#) : (200, "[]")
        }
        await store.removePlayer("Bo")
        #expect(store.turnOrder == ["Ann", "Cy"])
    }

    @Test func startWithoutEntriesWarns() async {
        let store = await makeStore(entries: "[]")
        await store.startGame()
        #expect(store.toast?.message == "Add some entries first!")
        #expect(!StubURLProtocol.requests.contains { $0.httpMethod == "POST" })
    }

    @Test func otherPlayersDerivesOtherPlayerNames() async {
        let store = await makeStore(
            entries: "[\(Self.entry("1", "Ann", "mine")),\(Self.entry("2", "Bo", "his"))]",
            game: #"{"turnOrder":["Ann","Bo","Charlie"]}"#,
            scores: #"[{"playerName":"Dan","score":5}]"#
        )
        #expect(store.otherPlayers == ["Bo", "Charlie", "Dan"])
    }

    @Test func transferHostSendsRequest() async {
        let store = await makeStore(entries: "[\(Self.entry("1", "Bo", "b"))]")
        defaults.set("tok123", forKey: "hostToken.ABCD")
        StubURLProtocol.respond = { request in
            (200, #"{"success":true}"#)
        }
        let success = await store.transferHost(to: "Bo")
        #expect(success)
        let post = StubURLProtocol.requests.first { $0.httpMethod == "POST" }
        #expect(post?.url?.path == "/api/games/ABCD/transfer-host")
        #expect(post?.value(forHTTPHeaderField: "x-host-token") == "tok123")
    }

    @Test func hostTransferredUpdatesHostStatus() async {
        let store = await makeStore()
        // Event for self ("Ann")
        let payloadSelf = #"{"newHostName":"Ann","hostToken":"newTok"}"#.data(using: .utf8)
        store.handle(event: "hostTransferred", payload: payloadSelf)
        #expect(store.isHost)
        #expect(store.hostName == "Ann")
        #expect(store.toast?.message == "You are now the host!")

        // Event for someone else ("Bo")
        let payloadOther = #"{"newHostName":"Bo","hostToken":"otherTok"}"#.data(using: .utf8)
        store.handle(event: "hostTransferred", payload: payloadOther)
        #expect(!store.isHost)
        #expect(store.hostName == "Bo")
        #expect(store.toast?.message == "Host duties transferred to Bo")
    }

    @Test func shareableRecapTextFormatsNicely() async {
        let store = await makeStore(
            entries: "[\(Self.entry("1", "Ann", "mine", guessed: true)),\(Self.entry("2", "Bo", "his", guessed: true))]",
            game: #"{"question":"Favorite food?"}"#,
            scores: #"[{"playerName":"Ann","score":3},{"playerName":"Bo","score":1}]"#
        )
        #expect(store.allGuessed)
        let recap = store.roundRecapText
        #expect(recap?.leader == "Ann (3)")
        let text = store.shareableRecapText
        #expect(text?.contains("Game of Things - Round Recap") == true)
        #expect(text?.contains("Question: \"Favorite food?\"") == true)
        #expect(text?.contains("🏆 Overall leader: Ann (3)") == true)
    }

    // MARK: - Turn timer (#72)

    @Test func noTimerWhenTheGameHasNone() async {
        let store = await makeStore(game: #"{"started":true,"turnOrder":["Ann","Bo"]}"#)
        #expect(store.turnEndsAt == nil)
    }

    @Test func deadlineIsMeasuredAgainstTheServerClock() {
        let now = Date(timeIntervalSince1970: 1_000)
        // The server's clock is years ahead of this device's; only the 30s gap matters.
        let local = GameStore.localDeadline(turnDeadline: 5_000_030_000, serverTime: 5_000_000_000, now: now)
        #expect(local == now.addingTimeInterval(30))
        #expect(GameStore.localDeadline(turnDeadline: nil, serverTime: 5, now: now) == nil)
        #expect(GameStore.localDeadline(turnDeadline: 5, serverTime: nil, now: now) == nil)
    }

    @Test func syncReadsTheDeadlineFromTheGame() async throws {
        let store = await makeStore(
            game: #"{"started":true,"turnOrder":["Ann","Bo"],"turnDeadline":2030000,"serverTime":2000000}"#)
        let left = try #require(store.turnEndsAt).timeIntervalSinceNow
        #expect(left > 28 && left <= 30)
    }

    @Test func nextTurnRestartsTheCountdownAndClearsItWithoutATimer() async throws {
        let store = await makeStore(game: #"{"turnOrder":["Ann","Bo"]}"#)
        store.handle(event: "nextTurn", payload: Data(
            #"{"currentPlayer":"Bo","turnOrder":["Bo","Ann"],"turnDeadline":2045000,"serverTime":2000000}"#.utf8))
        let left = try #require(store.turnEndsAt).timeIntervalSinceNow
        #expect(left > 43 && left <= 45)
        store.handle(event: "nextTurn", payload: Data(#"{"currentPlayer":"Ann","turnOrder":["Ann"]}"#.utf8))
        #expect(store.turnEndsAt == nil)
    }

    @Test func gameStartedEventStartsTheCountdown() async throws {
        let store = await makeStore()
        store.handle(event: "gameStarted", payload: Data(
            #"{"turnOrder":["Ann","Bo"],"turnDeadline":1060000,"serverTime":1000000}"#.utf8))
        let left = try #require(store.turnEndsAt).timeIntervalSinceNow
        #expect(left > 58 && left <= 60)
    }

    @Test func startGameSendsTheChosenTimerAndPicksUpTheFirstDeadline() async throws {
        let store = await makeStore(entries: "[\(Self.entry("1", "Bo", "a", revealed: false))]")
        defaults.set("tok", forKey: "hostToken.ABCD")
        store.turnSecondsChoice = 60
        StubURLProtocol.respond = { request in
            switch (request.httpMethod, request.url!.path) {
            case ("POST", "/api/games/ABCD/start"): (200, #"{"success":true,"turnOrder":["Bo","Ann"]}"#)
            case ("GET", "/api/games/ABCD"):
                (200, #"{"started":true,"turnOrder":["Bo","Ann"],"turnDeadline":1060000,"serverTime":1000000}"#)
            case ("GET", _) where request.url!.path.hasSuffix("/entries"): (200, "[\(Self.entry("1", "Bo", "a"))]")
            default: (200, "[]")
            }
        }
        await store.startGame()
        let post = try #require(StubURLProtocol.requests.first { $0.httpMethod == "POST" })
        #expect(try JSONDecoder().decode([String: Int].self, from: try #require(post.httpBody)) == ["turnSeconds": 60])
        #expect(try #require(store.turnEndsAt).timeIntervalSinceNow > 58)
    }

    @Test func startGameWithoutATimerSendsNoBody() async throws {
        let store = await makeStore(entries: "[\(Self.entry("1", "Bo", "a", revealed: false))]")
        defaults.set("tok", forKey: "hostToken.ABCD")
        await store.startGame()
        let post = try #require(StubURLProtocol.requests.first { $0.httpMethod == "POST" })
        #expect(post.httpBody == nil)
    }
}
}

struct TurnClockTests {
    @Test func formatsMinutesAndSeconds() {
        #expect(clockText(0) == "0:00")
        #expect(clockText(9) == "0:09")
        #expect(clockText(75) == "1:15")
        #expect(clockText(600) == "10:00")
        #expect(clockText(-3) == "0:00")
    }
}
