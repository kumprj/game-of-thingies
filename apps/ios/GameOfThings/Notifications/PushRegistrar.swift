import Foundation
import Observation
import UIKit
import UserNotifications

/// This device's APNs token and the system permission behind it (#71). Whether a player gets
/// notifications for a given game is that game's choice (`GameStore.notificationsEnabled`).
@Observable
final class PushRegistrar {
    static let shared = PushRegistrar()

    /// Hex APNs token, once iOS has issued one this launch.
    private(set) var deviceToken: String?

    /// Development builds use Apple's sandbox gateway, so the server needs to know which to call.
    static var isSandbox: Bool {
        #if DEBUG
        true
        #else
        false
        #endif
    }

    @ObservationIgnored private let authorize: () async -> Bool

    /// `authorize` asks the system for permission; tests pass a stub so nothing prompts.
    init(authorize: @escaping () async -> Bool = PushRegistrar.askSystem) {
        self.authorize = authorize
    }

    /// Asks for permission the first time (when the player has answered, so the prompt makes sense)
    /// and registers with APNs. Returns false when notifications are denied in Settings.
    func requestAndRegister() async -> Bool {
        guard await authorize() else { return false }
        UIApplication.shared.registerForRemoteNotifications()
        return true
    }

    private static func askSystem() async -> Bool {
        (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])) == true
    }

    /// At launch: if the player already allowed notifications, fetch a fresh token (they change).
    func refreshIfAuthorized() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        guard settings.authorizationStatus == .authorized else { return }
        UIApplication.shared.registerForRemoteNotifications()
    }

    func didRegister(deviceToken data: Data) {
        deviceToken = Self.hex(data)
    }

    static func hex(_ data: Data) -> String {
        data.map { String(format: "%02x", $0) }.joined()
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        Task { await PushRegistrar.shared.refreshIfAuthorized() }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        PushRegistrar.shared.didRegister(deviceToken: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // No token (no network, or the build isn't signed for push): the game works without one.
    }
}
