# Zomorod Pro 4.11

Compatibility target: PasarGuard **v5.6.0**, upstream commit `2b75db15cb0019a00252c59f9d1c34e6082a121f`.

## Visible changes

The subscription overview and connection workspace now sit side by side on desktop. Mobile prioritizes the balance and connection steps. Configuration lists include search, protocol filters, copy and QR actions. Data freshness and offline/error states are explicit. Existing custom colors, branding, namespace links, WireGuard downloads and application visibility remain supported.

The management tab includes an authenticated read-only contract/version report. Saving owner settings first retrieves the current native settings, preserving unrelated fields introduced by PasarGuard updates.

## Correctness and isolation

- Sum valid traffic buckets across all available series and sort their timestamps.
- Do not interpret an active account as proof of a connected VPN tunnel.
- Remove seeded random latency values.
- Only display copy success after the clipboard operation succeeds; clean up its timer.
- Decode VMess UTF-8 / URL-safe Base64; tolerate malformed display metadata.
- Limit QR payloads by UTF-8 bytes, rather than character count.
- Reject newline-injected WireGuard configuration fields; defer Blob URL revocation for Safari.
- Keep the main subscription action when individual configurations are hidden.
- Refresh configuration data on demand; stop retrying revoked/denied subscriptions.
- Bound JSON requests with timeouts, avoid caching account responses and show stale data explicitly.
- Remove inherited owner support headers for an explicitly configured reseller with no support contact.
- Honor runtime application visibility regardless of UI language.
- Constrain PWA manifests to their custom subscription scope; use the actual service-worker scope when focusing a window.
- Reject executable URLs in announcement, support and application actions.
- Update QR dependency to a release supporting React 19.

## Validation

Unit tests cover subscription parsing, traffic, URLs, WireGuard and Unicode. Python regressions cover branding isolation, PWA scope and the official 5.6.0 API signatures. Existing integration idempotency and script guards remain in CI. Browser tests use a rendered production Jinja template and synthetic data, including search/filtering, chart totals, copy, QR, mobile overflow, runtime visibility and token revocation.

No live customer data is used in previews. No accounts or database schema are changed by this update. API contract checks are narrower than a full installation test across all panel configurations.

## Updating

After this change is merged/released, use the existing `sudo zomorod update` workflow. The installer retains its timestamped backups and official PasarGuard lifecycle commands. Review the installed version and API report in Settings → Zomorod. Preserve the latest `/opt/zomorod/backups/` snapshot when upgrading a production instance.
