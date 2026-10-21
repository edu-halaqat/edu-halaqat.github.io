# Independent major review ranges and WhatsApp sharing

Release 20261022-v13.8.57.

In the integrated student plan builder, each major review can opt into an independent inclusive juz range. The existing default remains coverage after recent review. Teachers set first/last juz, daily unit/amount and direction. Example: juz 21–25 toward الناس; juz 26–30 toward الفاتحة. Each repeats separately after completing its boundary; no daily assignment crosses the range end. Available units: juz, hizb, half/quarter hizb, surahs, pages and ayahs. Existing plans are not migrated automatically.

The server validates the range, stores it in methodology_meta, disables automatic pairing for explicit ranges, and applies the same generator during creation, synchronization and horizon append. New private functions are invoker-only with public/anon/authenticated execution revoked. Existing guarded entry points retain their authentication and scope checks. Saved outcomes, notes, carry and prior dates are preserved.

WhatsApp accepts Arabic/Persian digits, avoids interpreting noopener's null return as failure, and provides a direct ready-message link when popup opening is blocked. Guardian portal lookup has a four-second optional deadline; saved-outcome verification remains mandatory, and changes during preparation reject stale sharing. Sending still requires the teacher to press Send within WhatsApp.

Validation: 56 SQL coverage cases (7 units × 2 directions × 4 ranges), two 15-day/three-cycle integration cases, append/rebuild equivalence, preserved saved row, and invalid-range rejection. Temporary integration writes rolled back. JS tests cover phones, links, blocked popup, portal failure, confirmed-save requirement and stale-message guard. No actual message was sent to a guardian.
