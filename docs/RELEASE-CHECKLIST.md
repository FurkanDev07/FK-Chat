# Release checklist

`1.0.2-recovery.1` is an unpublished development version. Earlier handoff builds are not evidence that this revision compiles or runs on either platform.

- Confirm the rights to publish recovered code under the repository's existing license. Check image ownership, identify the exact WebView2 and PeerJS versions, and verify provenance and redistribution terms for bundled binaries and assets.
- Scan dependencies, vendored files and repository history for vulnerabilities and credentials. `npm audit` covers the npm dependency tree only. Review WebView navigation and native bridge access, peer message validation, remote control consent/revocation, and credential storage before public use.
- Finish Turkish/English localization of runtime messages and native UI. Test both languages, preference persistence after restart, and that user content remains unchanged.
- Build and test on Android and Windows: fresh installation and update, microphone permissions, room creation/join, two-way audio, chat, reconnect, file transfers, shortcuts, and Windows overlay and remote control. Test on different networks, including a TURN-required connection. Record OS versions and outcomes; treat CI builds as compilation checks only.
- Verify Android's signed APK matches the authorized installed app's signing lineage and that an in-place update preserves data. Sign the Windows executable with the authorized signing identity and verify the signature on Windows. Use secured signing infrastructure; never place private keys or passwords in Git or logs.
- Only then publish verified signed binaries with their SHA-256 checksums, supported platforms and release notes. Add real download URLs and verify screenshot rendering on GitHub after the authorized push.
