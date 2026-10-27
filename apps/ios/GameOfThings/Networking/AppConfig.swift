import Foundation

enum AppConfig {
    /// Same split as client/src/apiUrl.ts: Debug talks to `npm run dev` (`sst dev`) on this Mac,
    /// Release to production. Set `API_URL` in the scheme's environment to point a Debug
    /// build elsewhere (e.g. production when running on a physical device).
    static let apiBaseURL: URL = {
        if let override = ProcessInfo.processInfo.environment["API_URL"],
           let url = URL(string: override) {
            return url
        }
        #if DEBUG
        return URL(string: "http://localhost:3001")!
        #else
        return URL(string: "https://api.gameofthings.fun")!
        #endif
    }()
}
