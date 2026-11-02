import Foundation
import Testing
@testable import GameOfThings

struct GameLinkTests {
    @Test(arguments: [
        ("gameofthings://ABCD", "ABCD"),
        ("gameofthings://abcd", "ABCD"),
        ("GameOfThings://WxYz/", "WXYZ"),
        ("https://gameofthings.fun/ABCD", "ABCD"),
        ("https://gameofthings.fun/abcd/", "ABCD"),
        ("https://example.com/WXYZ", "WXYZ"),
    ])
    func acceptsGameCodes(link: String, expected: String) {
        #expect(GameLink.gameId(from: URL(string: link)!) == expected)
    }

    @Test(arguments: [
        "gameofthings://ABC",
        "gameofthings://ABCDE",
        "gameofthings://AB1D",
        "gameofthings://",
        "https://gameofthings.fun/ABC",
        "https://gameofthings.fun/ABCDE",
        "https://gameofthings.fun/AB1D",
        "https://gameofthings.fun/",
        "http://gameofthings.fun/ABCD",
        "ftp://gameofthings.fun/ABCD",
    ])
    func rejectsEverythingElse(link: String) {
        #expect(GameLink.gameId(from: URL(string: link)!) == nil)
    }
}
