// OCR every PNG/JPG in a folder with Apple's Vision framework and print lines that contain banned words.
// Usage: swift scripts/media/ocr-frames.swift <frames-dir> [word,word,...]
// Exit code 1 when any banned word is found. No dependencies beyond macOS.
import Foundation
import Vision

let args = CommandLine.arguments
guard args.count >= 2 else {
    FileHandle.standardError.write("usage: ocr-frames.swift <dir> [words]\n".data(using: .utf8)!)
    exit(2)
}
let dir = URL(fileURLWithPath: args[1])
let banned = (args.count >= 3 ? args[2] : "unavailable,error,fallback,skipped,rules-only,exhausted")
    .lowercased().split(separator: ",").map(String.init)

let files = try FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
    .filter { ["png", "jpg", "jpeg"].contains($0.pathExtension.lowercased()) }
    .sorted { $0.lastPathComponent < $1.lastPathComponent }

var hits = 0
for file in files {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    let handler = VNImageRequestHandler(url: file, options: [:])
    try handler.perform([request])
    let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
    for line in lines {
        let lower = line.lowercased()
        if let word = banned.first(where: { lower.contains($0) }) {
            print("\(file.lastPathComponent)\t[\(word)]\t\(line)")
            hits += 1
        }
    }
}
print("checked \(files.count) frames, \(hits) hit(s)")
exit(hits > 0 ? 1 : 0)
