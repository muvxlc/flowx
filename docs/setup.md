# Meta Automator + 9router Jev: Operator Setup and Release Guide

## 1. Distribution Artifacts

The extension is built as a self-contained, reproducible Manifest V3 bundle:
- **Unpacked Directory**: `dist/`
- **Reproducible Archive**: `dist.zip` (contains `manifest.json`, `background.js`, `sidepanel.js`, `sidepanel.html`, `styles.css`)

### File Inventory
| File | Role | Security Property |
|---|---|---|
| `manifest.json` | Extension declaration (MV3) | Scoped origins, zero remote code, strict CSP |
| `background.js` | Service Worker | ES module, local state orchestration, alarms, concurrency=1 |
| `sidepanel.js` | Side Panel UI Application | Local controller, zero eval/new Function, zero hardcoded keys |
| `sidepanel.html` | Side Panel HTML Shell | Strictly local CSS/JS references, zero CDN/remote fonts |
| `styles.css` | UI Theme & Component Styling | Fully local styling tokens |

---

## 2. Installation Instructions (Unpacked in Chrome)

Due to Chrome security policy on macOS (`--load-extension is not allowed in Google Chrome, ignoring.`), installation must be performed via the Chrome extensions management interface:

1. Launch **Google Chrome**.
2. Navigate to `chrome://extensions/` in the address bar.
3. In the top-right corner, toggle **Developer mode** to **ON**.
4. Click the **Load unpacked** button in the top-left toolbar.
5. In the file picker, select the `dist/` directory inside this repository (or extract `dist.zip` and select the extracted folder).
6. Verify **Meta Automator + 9router Jev** appears with version `0.1.0`.
7. Click the Chrome **Extensions** toolbar puzzle icon and pin the extension for easy access.

---

## 3. Configuration of 9router Key (Mock Demonstration)

Follow these steps to configure demonstration settings safely without exposing credentials:

1. Click the pinned extension icon to open the **Side Panel**.
2. Click the **Settings** tab in the top navigation bar.
3. Locate the **9router API Key** field:
   - For safe demonstration / sandbox testing: Click the **Set Dummy Key** button, which populates `dummy_secret`.
   - Live network calls are blocked by Gate G1; live production keys are neither required nor published.
4. Review and toggle operational parameters:
   - **Consent**: Check *Consent to transmit prompt drafts to 9router for Jev evaluation*. (Required for Jev review; if unchecked, evaluation is halted).
   - **Enable Jev**: Toggle the checkbox to activate pre-submission evaluation.
   - **Timeout (ms)**: Default is `5000` ms (range 1000 - 30000 ms).
5. Click **Save Settings**.
6. Confirmation:
   - A success notification will appear.
   - The key is saved strictly to `chrome.storage.local`.
   - The UI never renders a show/reveal button.
   - You can remove the key at any time by clicking **Remove Key**.

---

## 4. Manifest & Security Audit Summary

- **Manifest Version**: 3
- **Explicit Permissions**:
  - `sidePanel`: Side panel user interface
  - `storage`: Local persistence for queue state and settings (`chrome.storage.local`)
  - `alarms`: Periodic wakeup for queue recovery and timeout checking
  - `downloads`: Exporting completed generation assets and metadata CSV
- **Forbidden & Denied Permissions Audit**:
  - NO `scripting` (automation is local, no remote injection or content scripting)
  - NO `<all_urls>`
  - NO `*://*/*` or broad wildcards
  - NO `webRequest` or `cookies`
  - NO `debugger` or `proxy`
- **Host Permissions**:
  - Strictly limited to `https://*.meta.ai/*` and `https://9router.bangkhan.com/*`.
- **Content Security Policy (CSP)**:
  - `extension_pages`: `"script-src 'self'; object-src 'self'; connect-src 'self' https://9router.bangkhan.com;"`
  - Zero remote code, zero external CDNs, zero `unsafe-eval`.
- **Secret Flow**:
  - Dummy secret (`dummy_secret`) used strictly for mock demonstration. No real personal keys are embedded in code, exported to CSV, sent to Meta AI, or synchronized via Chrome Sync.

---

## 5. Live Gate Status and Browser Limitations

| Gate / Component | Status | Operational Behavior |
|---|---|---|
| **Gate G0 (Meta AI Live Execution)** | **BLOCKED** | Live Meta AI generation is intentionally blocked in current unverified environment. All six execution modes (M1–M6) operate through `MetaMockAdapter` simulating full prompt and video/image generation flows. |
| **Gate G1 (9router Jev Live Network)** | **BLOCKED** | Live network calls to 9router remain blocked until production contract verification. Jev evaluations route through deterministic mock client (`MockJevClient`), respecting consent, confidence thresholds, and fail-safe human review routing. |
| **Chrome CLI Loading** | **BLOCKED** | Google Chrome for macOS rejects `--load-extension` CLI flag in release builds. Manual unpacked loading in `chrome://extensions` is required. |
| **Meta AI Session / Challenge** | **Fail-Closed** | Any detected login expiration, CAPTCHA challenge, or DOM selector mismatch pauses queue execution immediately and flags jobs as `needs-review`. |
