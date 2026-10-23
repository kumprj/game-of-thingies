import Foundation
import Testing
@testable import GameOfThings

/// Drives GameStore against canned server responses (StubURLProtocol) and injected socket events.
extension StubbedNetworkTests {
@Suite
struct GameStoreTests {
    let defaults: UserDefaults
    let api = APIClient(baseURL: URL(string: "http://test.local")!, session: StubURLProtocol.session())

    init() {
        defaults = UserDefaults(suiteName: "GameStoreTests")!
        defaults.removePersistentDomain(forName: "GameStoreTests")
        StubURLProtocol.requests = []
    }

    private func makeStore(me: String = "Ann", entries: String, game: String = "{}", scores: String = "[]") async -> GameStore {
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
                              guessed: Bool = false, createdAt: String = "2026-01-01T00:00:00Z") -> String {
        #"{"entryId":"\#(id)","authorName":"\#(author)","text":"\#(text)","createdAt":"\#(createdAt)","revealed":\#(revealed),"guessed":\#(guessed)}"#
    }

    @Test func syncLoadsGameAndDerivesTurn() async {
        let store = await makeStore(
            entries: "[\(Self.entry("1", "Bo", "zebra")),\(Self.entry("2", "Ann", "Apple"))]",
            game: #"{"gameOwner":"Friday","question":"Q?","turnOrder":["Ann","Bo"]}"#,
            scores: #"[{"playerName":"Bo","score":1},{"playerName":"Ann","score":3}]"#)
        #expect(store.gameTitle == "Friday")
        #expect(store.gameQuestion == "Q?")
        #expect(store.started)
        #expect(store.isMyTurn)
        #expect(store.sortedEntriesForDisplay.map(\.text) == ["Apple", "zebra"])
        #expect(store.scores.map(\.playerName) == ["Ann", "Bo"])
    }

    @Test func pregameListsInSubmissionOrder() async {
        let store = await makeStore(entries: """
            [\(Self.entry("1", "Bo", "a", revealed: false, createdAt: "2026-01-01T00:00:02Z")),
             \(Self.entry("2", "Cy", "b", revealed: false, createdAt: "2026-01-01T00:00:01Z"))]
            """)
        #expect(!store.started)
        #expect(store.sortedEntriesForDisplay.map(\.authorName) == ["Cy", "Bo"])
        #expect(store.canStart)
    }

    @Test func ownAnswerIsGuessableOnlyWhenLast() async {
        let store = await makeStore(entries: "[\(Self.entry("1", "Ann", "mine")),\(Self.entry("2", "Bo", "his"))]",
                                    game: #"{"turnOrder":["Ann","Bo"]}"#)
        let mine = store.entries.first { $0.authorName == "Ann" }!
        let his = store.entries.first { $0.authorName == "Bo" }!
        #expect(!store.canGuess(mine))
        #expect(store.canGuess(his))

        let last = await makeStore(entries: "[\(Self.entry("1", "Ann", "mine")),\(Self.entry("2", "Bo", "his", guessed: true))]",
                                   game: #"{"turnOrder":["Ann"]}"#)
        #expect(last.canGuess(last.entries.first { $0.authorName == "Ann" }!))
        #expect(last.isFullyGuessed("Bo"))
        #expect(last.guessedNames == ["Bo"] && last.notGuessedNames == ["Ann"])
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

    @Test func failedAddEntryDoesNotLock() async {
        let store = await makeStore(entries: "[]")
        StubURLProtocol.respond = { _ in (500, "{}") }
        store.entryText = "Tacos"
        await store.addEntry()
        #expect(!store.hasSubmitted)
        #expect(store.toast?.message == "Failed to add entry")
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

    @Test func startNewRoundSendsTrimmedQuestion() async {
        let store = await makeStore(entries: "[\(Self.entry("1", "Bo", "x", guessed: true))]")
        store.newQuestion = "  Best pizza? "
        await store.startNewRound()
        let post = StubURLProtocol.requests.first { $0.httpMethod == "POST" }!
        #expect(post.url?.path == "/api/games/ABCD/reset")
        #expect(try! JSONDecoder().decode([String: String].self, from: post.httpBody!) == ["question": "Best pizza?"])
        #expect(store.entries.isEmpty && !store.started && store.newQuestion.isEmpty)
    }

    @Test func startWithoutEntriesWarns() async {
        let store = await makeStore(entries: "[]")
        await store.startGame()
        #expect(store.toast?.message == "Add some entries first!")
        #expect(!StubURLProtocol.requests.contains { $0.httpMethod == "POST" })
    }
}
}
