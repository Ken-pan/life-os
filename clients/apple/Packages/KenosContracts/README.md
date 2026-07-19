# KenosContracts

Minimal shared Swift package for the frozen Kenos Phase 1 JSON envelopes. It is
not an Apple app or the Phase 4 workspace. Future Kenos iOS, macOS, and watchOS
targets should depend on this package instead of copying Codable models.

Tests read the repository-owned corpus at
`packages/contracts/fixtures/kenos/v1/`; this package does not carry a second
fixture copy.

```bash
swift test --package-path clients/apple/Packages/KenosContracts
```
