import SwiftUI
import UIKit

/// One confetti burst each time `trigger` changes to a new non-zero value
/// (the native stand-in for the web's canvas-confetti call).
struct ConfettiBurst: UIViewRepresentable {
    let trigger: Int

    func makeUIView(context: Context) -> ConfettiView {
        let view = ConfettiView()
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ view: ConfettiView, context: Context) {
        guard trigger != context.coordinator.lastTrigger else { return }
        context.coordinator.lastTrigger = trigger
        if trigger != 0 { view.burst() }
    }

    func makeCoordinator() -> Coordinator { Coordinator(lastTrigger: trigger) }

    final class Coordinator {
        var lastTrigger: Int
        init(lastTrigger: Int) { self.lastTrigger = lastTrigger }
    }
}

final class ConfettiView: UIView {
    // Same palette as useGameLogic.ts
    private static let colors: [UIColor] = ([0x26ccff, 0xa25afd, 0xff5e7e, 0x88ff5a, 0xfcff42, 0xffa62d, 0xff36ff] as [Int])
        .map(color(hex:))

    // Spelled out with explicit types: as one inline closure, Swift 6.3 (Xcode 26) gives up type-checking it.
    nonisolated private static func color(hex: Int) -> UIColor {
        let red = CGFloat((hex >> 16) & 0xff) / 255
        let green = CGFloat((hex >> 8) & 0xff) / 255
        let blue = CGFloat(hex & 0xff) / 255
        return UIColor(red: red, green: green, blue: blue, alpha: 1)
    }

    private static let piece = UIGraphicsImageRenderer(size: CGSize(width: 10, height: 6)).image { context in
        UIColor.white.setFill()
        context.fill(CGRect(x: 0, y: 0, width: 10, height: 6))
    }.cgImage

    func burst() {
        let emitter = CAEmitterLayer()
        emitter.emitterPosition = CGPoint(x: bounds.midX, y: bounds.height * 0.6)
        emitter.emitterShape = .point
        emitter.beginTime = CACurrentMediaTime()
        emitter.emitterCells = Self.colors.map { color in
            let cell = CAEmitterCell()
            cell.contents = Self.piece
            cell.color = color.cgColor
            cell.birthRate = 100
            cell.lifetime = 3
            cell.velocity = 650
            cell.velocityRange = 250
            cell.emissionLongitude = -.pi / 2
            cell.emissionRange = .pi * 35 / 180 // 70° spread
            cell.yAcceleration = 900
            cell.spin = 4
            cell.spinRange = 10
            cell.scale = 0.9
            cell.scaleRange = 0.4
            cell.alphaSpeed = -0.35
            return cell
        }
        layer.addSublayer(emitter)
        // ~100 pieces total, then let them fall out
        Task {
            try? await Task.sleep(for: .milliseconds(150))
            emitter.birthRate = 0
            try? await Task.sleep(for: .seconds(3.5))
            emitter.removeFromSuperlayer()
        }
    }
}
