import Foundation

struct RecentGameRecord: Codable, Identifiable, Equatable, Sendable {
    var id: String { gameId }
    let gameId: String
    let title: String
    let lastVisited: Double

    init(gameId: String, title: String, lastVisited: Double = Date().timeIntervalSince1970) {
        self.gameId = gameId
        self.title = title
        self.lastVisited = lastVisited
    }
}

enum RecentGamesStore {
    static let storageKey = "got_recent_games"
    static let maxRecents = 5

    static func load(defaults: UserDefaults = .standard) -> [RecentGameRecord] {
        guard let data = defaults.data(forKey: storageKey),
              let list = try? JSONDecoder().decode([RecentGameRecord].self, from: data) else {
            return []
        }
        return list
    }

    static func save(_ records: [RecentGameRecord], defaults: UserDefaults = .standard) {
        if let data = try? JSONEncoder().encode(records) {
            defaults.set(data, forKey: storageKey)
        }
    }

    static func record(gameId: String, title: String?, defaults: UserDefaults = .standard, date: Date = Date(), limit: Int = maxRecents) {
        var recents = load(defaults: defaults).filter { $0.gameId != gameId }
        let record = RecentGameRecord(gameId: gameId, title: title ?? gameId, lastVisited: date.timeIntervalSince1970)
        recents.insert(record, at: 0)
        if recents.count > limit {
            recents = Array(recents.prefix(limit))
        }
        save(recents, defaults: defaults)
    }

    static func remove(gameId: String, defaults: UserDefaults = .standard) {
        var recents = load(defaults: defaults)
        let initialCount = recents.count
        recents.removeAll { $0.gameId == gameId }
        if recents.count != initialCount {
            save(recents, defaults: defaults)
        }
    }
}
