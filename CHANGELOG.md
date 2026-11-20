# Changelog

## 1.0.2-recovery.1 — unpublished recovery preview

- Imported the checksum-verified recovery sources and four browser screenshots; excluded the experimental APK/EXE artifacts.
- Aligned the development version across Android, Windows and npm.
- Localized selected connection states and peer notifications without translating peer names or chat messages. Native translation remains incomplete.
- Removed the broken, unused Android `readUri` JavaScript bridge method. The existing file chooser was not changed; file transfer remains unverified on devices.
- Added web checks and native compile jobs. No tag, signed binary or release was published.

## Earlier recovery work

- Simplified the home screen and several settings/help messages while retaining privacy, security and error guidance. Added corresponding English preview strings and a focused test.
- Reconstructed an Android Gradle project around the recovered Java, manifest, resources and existing web assets.
- Reconstructed `CallService.startCall()` from the instruction listing retained in the recovered source. Its behavior has not been verified on a device.
- Repaired several invalid decompiler-generated Java callback references and capture declarations to allow compilation.
- Added WebView2 reference paths and .NET Framework reference-assembly restore to the Windows project; repaired a decompiled enum comparison to allow compilation.
- Added an **incomplete, experimental** English translation of selected static web text and a persistent preview selector. Dynamic text and native UI are not fully translated.
- Added limited jsdom tests, recovery notes and a conservative `.gitignore`.
- Created debug-signed Android and Windows test builds. Neither is a verified release. Android signing is not the original release signing identity.
- No production signing setup was created.
