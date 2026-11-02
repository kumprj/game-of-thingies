import Foundation
import Testing
@testable import GameOfThings

@Suite(.serialized)
struct RecentGamesStoreTests {
    let defaults: UserDefaults

    init() {
        defaults = UserDefaults(suiteName: "RecentGamesStoreTests")!
        defaults.removePersistentDomain(forName: "RecentGamesStoreTests")
    }

    @Test func loadsEmptyWhenNoData() {
        #expect(RecentGamesStore.load(defaults: defaults).isEmpty)
    }

    @Test func recordsAndLoadsRecentGames() {
        RecentGamesStore.record(gameId: "ABCD", title: "Game 1", defaults: defaults)
        let loaded = RecentGamesStore.load(defaults: defaults)
        #expect(loaded.count == 1)
        #expect(loaded.first?.gameId == "ABCD")
        #expect(loaded.first?.title == "Game 1")
    }

    @Test func updatesOrderWhenRecordedAgain() {
        RecentGamesStore.record(gameId: "ABCD", title: "Game 1", defaults: defaults)
        RecentGamesStore.record(gameId: "WXYZ", title: "Game 2", defaults: defaults)
        RecentGamesStore.record(gameId: "ABCD", title: "Game 1 Updated", defaults: defaults)

        let loaded = RecentGamesStore.load(defaults: defaults)
        #expect(loaded.map(\.gameId) == ["ABCD", "WXYZ"])
        #expect(loaded.first?.title == "Game 1 Updated")
    }

    @Test func enforcesFiveGameLimit() {
        for i in 1...7 {
            RecentGamesStore.record(gameId: "GM0\(i)", title: "Game \(i)", defaults: defaults)
        }
        let loaded = RecentGamesStore.load(defaults: defaults)
        #expect(loaded.count == 5)
        #expect(loaded.map(\.gameId) == ["GM07", "GM06", "GM05", "GM04", "GM03"])
    }

    @Test func removesGameById() {
        RecentGamesStore.record(gameId: "ABCD", title: "Game 1", defaults: defaults)
        RecentGamesStore.record(gameId: "WXYZ", title: "Game 2", defaults: defaults)
        RecentGamesStore.remove(gameId: "ABCD", defaults: defaults)

        let loaded = RecentGamesStore.load(defaults: defaults)
        #expect(loaded.map(\.gameId) == ["WXYZ"])
    }

    @Test func fallsBackToGameIdWhenTitleIsNil() {
        RecentGamesStore.record(gameId: "ABCD", title: nil, defaults: defaults)
        let loaded = RecentGamesStore.load(defaults: defaults)
        #expect(loaded.first?.title == "ABCD")
    }
}
