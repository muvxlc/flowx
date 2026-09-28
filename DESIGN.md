# DESIGN.md — Meta Automator + 9router Jev Extension Design Contract

## 0. Research & Provenance Log
- **Approved Reference Source**: `meta-automator-prototype.html?variant=A&view=sidepanel` (Absolute path: `/Volumes/data/opencode/flow/meta-automator-prototype.html`).
- **Approved Variant**: **Variant A (Technical Operator Stream / Linear Console)**. Variant B (Studio Cards) and Variant C (Minimal Command Dock) are exploratory prototype options and strictly rejected for production implementation.
- **Prototype Floating Dock Exclusion**: The prototype floating bar (`.floating-bar` with variant/view toggles) is a prototype harness mechanism only; it must never be included in the extension side-panel runtime.
- **Reference Evidence**: Extracted from Playwright headless inspection artifacts (`.playwright-mcp/page-*.yml`, `.playwright-mcp/console-*.log`) and raw source CSS in `meta-automator-prototype.html` lines 8–42, 672–704.
- **Associated Plan Tasks & Gate Status**: Governs Task 7 (Queue UI), Task 8 (Create UI for 6 Modes), Task 13 (Settings & Credential Shell), and Task 17 (Browser UX & Visual QA). Note G1 gate status: `Jev 1.13 Free` is an unverified display-only label; verified model ID is UNAVAILABLE and BLOCKED (`.omo/evidence/task-2-meta-automator-jev.txt`). Live router tests remain disabled until verified credentials and contracts are proven.
- **Core Stance**: High-density operator cockpit; decisions and execution progress take precedence over decorative visuals. Zero copied competitor logos, trademarked assets, or marketing fluff.

---

## 1. Executive Summary & Dial Declarations

Reading this as: **Chrome Extension Side Panel for Automation Operator, optimized for queued multi-mode generation and supervised execution.**

- **Density**: `8/10` (High-density technical console; compact 4px grid, monospace identifiers, dense tabular list rows, 11px–12px typography).
- **Motion**: `2/10` (Restrained, functional transitions only; 150ms opacity/transform feedback; strict `prefers-reduced-motion` compliance; zero perpetual animations or decorative ambient drifts).
- **Component Foundation**: Semantic HTML5 + Custom CSS Tokens (Isolated Manifest V3 side panel DOM; native elements with CSS custom properties; no external runtime UI frameworks).
- **Theme Strategy**: Dark Technical Console (`--bg-canvas: #0c0e12`, `--bg-surface: #151821`, `--bg-surface-elevated: #161b26`, `--border-subtle: #2d3748`). Monochromatic baseline with disciplined semantic status accents.
- **Primary Workspace**: Standard Chrome Side Panel at fixed `420px` width, with responsive fluid adaptation down to `320px` narrow viewport.

---

## 2. Color & Design Token System (Variant A Specification)

All visual properties must trace to these CSS custom properties. Hardcoded hex values, random RGB declarations, or ad-hoc border colors are strictly prohibited.

### 2.1 Surface & Background Tokens
| Token Name | Value | Purpose / Usage |
|---|---|---|
| `--bg-canvas` | `#0c0e12` | Deep root background of the extension viewport / window body |
| `--bg-surface` | `#151821` | Base container background for `.panel-container` |
| `--bg-surface-elevated` | `#161b26` | Card background, active queue items, modal cards (Variant A override of `#1d212d`) |
| `--bg-surface-active` | `#242938` | Hover/active states for buttons, selected segmented chips |
| `--bg-input` | `#11141c` | Background for text inputs, textareas, selects, mode switch matrices |
| `--bg-tab-bar` | `#11141c` | Navigation tab bar strip (Variant A specific) |
| `--bg-tab-active` | `#1a202c` | Active navigation tab button background (Variant A specific) |

### 2.2 Border & Hairline Tokens
| Token Name | Value | Purpose / Usage |
|---|---|---|
| `--border-subtle` | `#2d3748` | Primary divider hairline, panel container border, card outlines (Variant A specific) |
| `--border-strong` | `#363d52` | Elevated card hover borders, secondary control outlines |
| `--border-focus` | `#4f68ff` | Focus ring outline for keyboard accessibility and active form controls |
| `--border-tab-active` | `#3b82f6` | 2px bottom accent indicator for active navigation tab |

### 2.3 Typography & Text Tokens
| Token Name | Value | Purpose / Usage |
|---|---|---|
| `--text-main` | `#f0f3f8` | Primary text, titles, user prompts, active button labels (High contrast: ~14.8:1 on canvas) |
| `--text-muted` | `#8b95a5` | Secondary text, field labels, metadata timestamps, inactive tabs (~5.8:1 on canvas) |
| `--text-subtle` | `#576071` | Helper text, disabled placeholders, inactive counters (~3.2:1) |
| `--text-accent` | `#60a5fa` | Monospace code highlights, highlighted counters |

### 2.4 Accent & Brand Tokens
| Token Name | Value | Purpose / Usage |
|---|---|---|
| `--accent-primary` | `#3b66ff` | Primary CTA buttons, active radio tabs, selection indicator |
| `--accent-hover` | `#4e75ff` | Primary button hover state |
| `--accent-subtle` | `rgba(59, 102, 255, 0.15)` | Active item badge background, subtle selection tint |
| `--jev-purple` | `#9d5cff` | Jev 9router branding accent, quality evaluation badges |
| `--jev-purple-subtle`| `rgba(157, 92, 255, 0.15)`| Jev score pill background, pre-check container background |
| `--jev-purple-text` | `#c084fc` | High-contrast purple text for Jev badges and scores |

### 2.5 Semantic Status Tokens
Status colors carry operational state only. Decorative status dots or arbitrary badge colors are forbidden.
| Semantic State | Foreground | Background Subtle | Usage in Queue / Provider |
|---|---|---|---|
| `pending` | `#8b95a5` | `#242938` | Job queued, waiting for worker step |
| `running` | `#93c5fd` | `rgba(59, 102, 255, 0.15)` | Active generation in progress |
| `completed` | `#6ee7b7` | `rgba(16, 185, 129, 0.15)` | Output verified and ready for download |
| `needs-review` | `#fcd34d` | `rgba(245, 158, 11, 0.15)` | Low Jev score, Thai ambiguity, or 429 pause |
| `paused` | `#d1d5db` | `#374151` | Operator paused queue or challenge pause |
| `failed` | `#fca5a5` | `rgba(239, 68, 68, 0.15)` | Provider error, missing selector, invalid ref |

### 2.6 Geometry & Elevation Tokens
| Token Name | Value | Purpose / Notes |
|---|---|---|
| `--radius-sm` | `2px` | Badges, pills, small icon buttons (Variant A tight radius) |
| `--radius-md` | `4px` | Standard buttons, input fields, cards, toolbar strips (Variant A) |
| `--radius-lg` | `4px` | Panel container outer shell (Variant A overrides default 12px) |
| `--shadow-sm` | `0 1px 2px rgba(0, 0, 0, 0.4)` | Tab active elevation |
| `--shadow-md` | `0 4px 12px rgba(0, 0, 0, 0.5)`| Tooltip, dropdown, notification toast |
| `--shadow-lg` | `0 8px 24px rgba(0, 0, 0, 0.6)`| Side-panel outer container elevation |

---

## 3. Typography & Hierarchy

### 3.1 Font Stacks
- **UI Sans-Serif Stack (`--font-sans`)**:
  `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`
  Used for header titles, tab labels, body copy, button labels, and system messages.
- **Monospace Code Stack (`--font-mono`)**:
  `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`
  Mandatory for: Job IDs (`#1 JOB-201`), tab counters (`[3]`), progress percentages (`25%`), Jev score pills (`94/100`), API endpoints, timestamps, and model ID placeholders (unverified mock identifier).

### 3.2 Type Scale
| Level | Font Size | Line Height | Weight | Family | Example / Role |
|---|---|---|---|---|---|
| Panel Title | `13.5px` | `1.2` | 600 | Sans | `Meta Automator v2.0` |
| Section Title | `11.0px` | `1.3` | 600 | Sans (Uppercase) | `1. MEDIA TARGET`, `2. GENERATION MODE` |
| Card Title | `11.5px` | `1.3` | 600 | Sans | `Pinned 9router Target`, `Connection Test` |
| Body / Form Text| `12.0px` | `1.45` | 400–500 | Sans | Input text, button labels, status messages |
| Prompt Textarea | `11.5px` | `1.5` | 400 | Mono | Prompt input lines, multiline editor |
| Tab Button | `11.0px` | `1.2` | 500–600 | Mono (Variant A) | `Create`, `Queue`, `Downloads`, `Settings` |
| Metadata / Badge| `10.0px` | `1.2` | 600 | Mono | `Jev 1.13 Free`, `TEXT`, `IMAGE`, `COMPLETED` |
| Helper / Footnote| `9.5px–10.0px` | `1.3` | 400 | Sans | `1 line = 1 generation job`, Thai guidance notes |

---

## 4. Geometry, Layout & Responsive Side-Panel Anatomy

### 4.1 Side Panel Root Geometry
```
+-------------------------------------------------------------+
| Header: [Logo] Meta Automator v2.0-mock    [● Jev 1.13 Free]| (h: 44px)
+-------------------------------------------------------------+
| Nav Tabs: [Create]   [Queue (3)]   [Downloads (2)] [Settings]| (h: 34px)
+-------------------------------------------------------------+
| Active Tab Body (Scrollable container: max-h: 720px)       |
|                                                             |
|  [ Section 1: Controls / Matrix / Inputs ]                 |
|  [ Section 2: Cards / Items / Progress ]                    |
|  [ Section 3: Action Buttons Strip (Pinned / Margin-top) ]  |
|                                                             |
+-------------------------------------------------------------+
```

- **Width Contract**:
  - **Standard Chrome Side Panel**: `width: 420px; max-width: 100%;`
  - **Narrow Viewport Fallback (320px–380px)**: All multi-column grids (`.downloads-grid`, mode matrices) must flex-wrap or collapse to single column without horizontal document scrolling.
  - **Container**: `display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); background: var(--bg-surface);`

### 4.2 Spacing & Padding Scale (4px Base Grid)
- `4px` (`--space-1`): Tab inner spacing, badge padding, icon gap.
- `6px` (`--space-1.5`): Matrix gap, toolbar gap, form-group vertical gap.
- `8px` (`--space-2`): Queue list item gap, button padding horizontal (`7px 12px`), downloads grid gap.
- `10px` (`--space-2.5`): Card internal padding, queue item internal padding.
- `12px` (`--space-3`): Header padding (`12px 14px`), card horizontal padding.
- `14px` (`--space-3.5`): Tab body padding (`14px`), main gap between sections.
- `16px` (`--space-4`): Outer viewport margins.

---

## 5. Component Primitives & Operator Anatomy

### 5.1 Navigation Tabs (`.nav-tabs`, `.nav-tab-btn`)
- **Structure**: Horizontal flexbox spanning 100% width with 4 tabs: `Create`, `Queue`, `Downloads`, `Settings`.
- **Variant A Contract**:
  - Background: `#11141c`.
  - Border Bottom: `1px solid #2d3748`.
  - Buttons: `font-family: var(--font-mono); font-size: 11px; padding: 8px 6px; border-radius: 2px; color: var(--text-muted);`.
  - Inactive Hover: `background: #1d212d; color: var(--text-main);`.
  - Active Tab: `background: #1a202c; color: #fff; font-weight: 600; border-bottom: 2px solid #3b82f6;`.
  - Tab Counter Pill: Monospace numeric pill (`font-size: 10px; padding: 1px 5px; border-radius: 10px; background: var(--bg-surface-active); color: var(--text-muted);`). When active: `background: var(--accent-subtle); color: #93c5fd;`.

### 5.2 Buttons (`.btn`)
- **Base**: `display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 7px 12px; border-radius: var(--radius-md); font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.15s ease;`.
- **Variants**:
  - `.btn-primary`: `background: var(--accent-primary); color: #fff; border: 1px solid transparent;` (Hover: `var(--accent-hover)`).
  - `.btn-secondary`: `background: var(--bg-surface-elevated); color: var(--text-main); border: 1px solid var(--border-subtle);` (Hover: `var(--bg-surface-active); border-color: var(--border-strong);`).
  - `.btn-outline-purple`: `background: var(--jev-purple-subtle); color: #d8b4fe; border: 1px solid rgba(157, 92, 255, 0.4);` (Hover: `rgba(157, 92, 255, 0.25)`).
  - `.btn-danger`: `background: var(--status-danger-subtle); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3);` (Hover: `rgba(239, 68, 68, 0.25)`).
  - `.btn-sm`: `padding: 4px 8px; font-size: 11px; border-radius: var(--radius-sm);`.
  - `.icon-btn`: `width: 22px; height: 22px; padding: 0; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); color: var(--text-muted);`.

### 5.3 Form Controls & Inputs
- **Inputs & Textareas (`.input-text`, `.textarea`, `.select`)**:
  - `background: var(--bg-input); border: 1px solid var(--border-subtle); color: var(--text-main); padding: 8px 10px; border-radius: var(--radius-md); font-size: 12px;`.
  - Focus Ring: `border-color: var(--border-focus); box-shadow: 0 0 0 2px rgba(79, 104, 255, 0.2); outline: none;`.
  - Read-Only Inputs: `background: #0f1218; color: #94a3b8; cursor: not-allowed; border-style: dashed;`.
  - Textarea: `font-family: var(--font-mono); font-size: 11.5px; line-height: 1.5; min-height: 80px; resize: vertical;`.

### 5.4 6-Mode Selection Matrix (`.mode-matrix`, `.mode-pill`)
- **Layout**: 3-column CSS Grid (`grid-template-columns: repeat(3, 1fr); gap: 6px; background: var(--bg-input); padding: 6px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);`).
- **Pill Elements**:
  - `background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 6px 4px; text-align: center; cursor: pointer;`.
  - Title: `font-size: 10.5px; font-weight: 500;`.
  - Sub-label (`.mode-tag`): `font-size: 9px; font-family: var(--font-mono); opacity: 0.8;`.
  - Active State: `background: var(--accent-subtle); border-color: var(--accent-primary); color: #fff;`.

### 5.5 Queue Item Card (`.queue-item`)
- **Container**: `background: #161b26; border: 1px solid #2d3748; border-radius: 4px; padding: 10px; display: flex; flex-direction: column; gap: 6px;`.
- **States**:
  - Running: `border-color: var(--accent-primary); box-shadow: 0 0 10px rgba(59, 102, 255, 0.2);`.
  - Needs Review: `border-color: var(--status-warning);`.
  - Failed: `border-color: var(--status-danger);`.
- **Header Elements**:
  - Left: Job Index + ID (`#1 JOB-201`), Media Mode badge (`TEXT`, `SINGLE`, `PAIRED`).
  - Right: Status badge (`pending`, `running`, `completed`, `needs-review`, `paused`, `failed`), Reorder buttons (`▲`, `▼`).
- **Body Elements**:
  - Prompt text preview: `font-size: 11.5px; line-height: 1.4; max-height: 2 lines (-webkit-line-clamp: 2);`.
- **Footer Metadata Row**:
  - Timestamp, reference asset pill (if any), Jev Decision pill (`choice: photorealistic, score: 94/100`), Action buttons (`Delete`, `Retry`).

### 5.6 Progress Bar (`.progress-bar-wrap`, `.progress-bar-fill`)
- **Wrap**: `height: 6px; background: var(--bg-input); border-radius: 3px; overflow: hidden; border: 1px solid var(--border-subtle);`.
- **Fill**: `height: 100%; background: var(--accent-primary); transition: width 0.3s ease;`.

---

## 6. Workflow Navigation & Tab Specifications

### 6.1 Tab 1: Create Panel (Task 8 Contract)
1. **Interactive Prototype Tour Banner**:
   - Purple dashed card informing operator of local template and scoring capabilities.
2. **Media Target Selector**:
   - Segmented toggle: `Image (ภาพนิ่ง)` vs `Video (วิดีโอแอนิเมชัน)`.
3. **Generation Mode Matrix**:
   - 3 modes: `Text-Only (1:0)`, `Single Ref (1:N)`, `Paired 1:1 (N:N)`.
   - Dynamic summary label: `[Image|Video] • [Text-Only|Single Ref|Paired 1:1]`.
4. **Reference Asset Area**:
   - Conditionally visible when mode is `Single Ref` or `Paired 1:1`.
   - Card displaying thumbnail, asset name (`portrait_cyber_01.png`), dimensions, file size, and upload/change button.
5. **Prompts Input Area**:
   - Textarea with 1-line-per-job rule.
   - Header with helper: `1 line = 1 generation job`.
   - Footer toolbar: Live line count (`3 prompts ready`), `Load Samples` button, `Template Helper` button.
6. **Deterministic Local Prompt Helper (No LLM)**:
   - Accordion card containing theme selector (`Cinematic`, `Minimalist`, `Cyberpunk`, `Thai Contemporary`) and lighting selector (`Golden Hour`, `Studio Soft`, `Dramatic`).
   - Button: `Append Formatted Prompt to Editor`.
7. **Jev Quality Pre-Check Card (Simulated Rubric Only)**:
   - Header badge `Jev 1.13 Free` is display-only.
   - Scoring simulates 9router System One typed rubric (`choice`, `score`, `noul`) using local fixtures; live API execution is disabled until verified model ID is proven.
   - Button: `Run Evaluation`.
8. **Action Bar**:
   - `Import .txt` button (secondary) + `Add to Queue (N jobs)` (primary).

### 6.2 Tab 2: Queue Panel (Task 7 Contract)
1. **Toolbar Strip**:
   - Left: `Start Queue` / `Pause Queue` primary button + `Step 1 Job` (deterministic step).
   - Right: `Simulate 429` (test challenge pause) + `Clear Done` (cleanup completed).
2. **Overall Progress Card**:
   - Label: `Queue Progress: X of Y Completed`.
   - Percentage: Monospace accent text (`25%`).
   - Visual progress bar fill.
3. **Queue Status Alert**:
   - Dynamic banner shown when queue is running, paused, or halted by challenge.
4. **Queue Items List**:
   - Interactive reordering via `▲` and `▼` buttons.
   - Running job exhibits subtle pulse and active progress bar.
   - Failed or Needs-Review jobs offer direct operator action (`Retry`, `Review`).

### 6.3 Tab 3: Downloads & CSV Export (Task 11 Contract)
1. **Toolbar Strip**:
   - Filters: `All (N)`, `Images`, `Videos`.
   - Actions: `Download All` (primary) + `Export CSV` (secondary).
2. **Downloads Grid**:
   - 2-column card grid (`grid-template-columns: repeat(2, 1fr); gap: 8px;`).
   - Card displays media thumbnail preview, media type badge (`IMG`, `VID`), clean generated filename, resolution, and seed.
   - Fallback for narrow viewport (<360px): collapses cleanly to 1 column.

### 6.4 Tab 4: Settings & Personal Key Lifecycle (Task 13 Contract)
1. **Pinned 9router Target Card**:
   - Strict read-only input: `https://9router.bangkhan.com/v1/systemone`.
   - Security Notice: Pinned endpoint policy strictly prohibits arbitrary destination URL override to prevent credential leakage.
2. **Model Identifier & Display Status (G1 Gate: Model ID UNAVAILABLE & BLOCKED)**:
   - **Display Label Only**: `Jev 1.13 Free` is strictly an unverified display-only label, not a verified model ID.
   - **Verified Model ID Status**: **UNAVAILABLE / UNKNOWN** (G1 Contract Gate BLOCKED in `.omo/evidence/task-2-meta-automator-jev.txt`).
   - **UI Input Representation**: Read-only input field preserving Prototype A styling, displaying unverified status or placeholder (e.g., `jev-latest (unverified)` or `Unavailable - G1 Blocked`).
   - **Mandatory Helper Warning**: "Display label 'Jev 1.13 Free' is marketing/display-only. Upstream 9router route `/v1/systemone` has not exposed or confirmed a verified model ID. Live Jev decisions remain disabled until proven with authorized credentials."
3. **Personal API Key Control**:
   - Masked password input (`type="password"`) with `Show / Hide` button.
   - Extension-local only indicator: Stored in `chrome.storage.local`; never synchronized to Chrome Sync or exposed to host pages.
   - `Insert Dummy Key` helper for testing.
4. **Connection Test Card (Simulated Only / Live Test Disabled)**:
   - `Test Ping` button operates in mock/simulated mode only with simulated latency (~140ms).
   - Live network ping to `https://9router.bangkhan.com/v1/systemone` is strictly disabled until G1 contract gate is unblocked with authorized personal credentials and verified CORS/route support.
5. **Security & Privacy Consent**:
   - Mandatory checkbox requiring operator consent prior to prompt transfer.
6. **Action Bar**:
   - `Reset Defaults` (secondary) + `Save Settings` (primary).

---

## 7. State Machine Visual Contracts

| State Name | Visual Presentation | Border / Accent | Operator Action Allowed |
|---|---|---|---|
| `empty` | Dotted outline card with centered icon and explanation text | `--border-subtle` | Prompt import or sample load |
| `loading` | Skeleton block matching final item geometry with 150ms shimmer | `--bg-surface-active` | None (Interaction blocked) |
| `running` | Accent border with subtle glowing drop-shadow (`rgba(59, 102, 255, 0.2)`) | `--accent-primary` | `Pause Queue`, `Cancel Job` |
| `completed`| Success badge (`#6ee7b7`), checkmark icon, thumbnail preview | `--status-success` | `Download`, `Inspect`, `Clear` |
| `needs-review`| Warning amber badge, prompt highlighted, Jev reason displayed | `--status-warning` | `Edit Prompt`, `Approve`, `Skip` |
| `paused` | Muted slate badge (`#d1d5db`), paused progress bar indicator | `--border-strong` | `Resume Queue`, `Step 1 Job` |
| `failed` | Error red badge (`#fca5a5`), error text message displayed | `--status-danger` | `Retry Job`, `Inspect Log` |
| `stale` | Muted opacity (`opacity: 0.6`) with "Outdated Config" indicator | `--border-subtle` | `Re-evaluate`, `Dismiss` |

---

## 8. Sample & Mock Data Policy

To prevent any confusion between simulated prototype values and verified live data:
1. **Prominent Watermark / Notice**: All mock items must bear explicit labeling: `[PROTOTYPE • SIMULATED]`, `v2.0-mock`, or `Sample Data`.
2. **No Fabricated Success Metrics**: Zero invented completion rates, false throughput stats, or unverified generation speeds.
3. **Isolation of Credentials**: All mock keys must use `sk-9r-sample-key-mock-valid-3982` or `dummy_secret`. Live user credentials must never be pre-populated or committed to source.
4. **Mock Provider Identification**: Downstream mock provider must identify itself as `meta-ai-v1-mock`.
5. **Jev 9router Model Status**: The label `Jev 1.13 Free` is strictly display-only. The verified model identifier is UNKNOWN and BLOCKED under Gate G1. Live model requests and live connection tests remain disabled until verified credentials and endpoints are proven. No verified ID claim is permitted.

---

## 9. Accessibility & Cognitive Constraints

- **WCAG AA Compliance**: All text-to-background combinations meet or exceed 4.5:1 for standard text and 3:1 for large text. Monospace code highlights maintain at least 4.5:1 against input backgrounds.
- **Focus Rings**: Mandatory 2px visible focus ring (`--border-focus: #4f68ff`, offset 2px) on all interactive elements via `:focus-visible`.
- **Keyboard Navigation**:
  - Full tab traversal: `Tab` / `Shift+Tab` cycles sequentially through header brand -> navigation tabs -> tab content controls -> action buttons.
  - Arrow navigation: `Left` / `Right` arrows switch active tab in `[role="tablist"]`.
  - Modal / Sheet Escape: `Escape` key closes previews or dialog drawers, restoring focus to triggering element.
- **ARIA Landmark & Roles**:
  - Navigation tab bar: `role="tablist"`, each button `role="tab"`, `aria-selected="true|false"`, `aria-controls="tabContentX"`.
  - Content sections: `role="tabpanel"`, `aria-labelledby="tabBtnX"`.
  - Media toggles: `role="radiogroup"`, `aria-label="Media Target"`.
  - Status badges: Include programmatic status names for screen readers, not color-only cues.
- **Motion Reduction**:
  - Enforce `@media (prefers-reduced-motion: reduce) { * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }`.

---

## 10. Scope Boundaries & Anti-Patterns

1. **NO Competitor Asset Cloning**: Zero copying of AutoPlayLabs logos, vector icons, or proprietary styling. All icons are generic SVG line primitives (Lucide/Feather format).
2. **NO Stealth / Evasion Modes**: No stealth toggles, CAPTCHA bypass controls, or fake human typing speed controls.
3. **NO Production Variant Switcher**: The floating switcher bar (`.floating-bar`) from `meta-automator-prototype.html` is strictly omitted from the extension build.
4. **NO Arbitrary Router Endpoints**: The 9router endpoint is hardcoded/pinned to `https://9router.bangkhan.com/v1/systemone` in the UI to prevent redirection risks.
5. **Single-User Scope**: Local storage only; multi-tenant sync is strictly out of scope.
