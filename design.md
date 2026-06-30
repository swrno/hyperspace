# Restructuring hypr: Integrations, Applications & App Playground

## Goal
Restructure the hypr platform UI based on 6 changes: (1) Integrations should only show "Connected" status, not repo lists, (2) Add an "Applications" section where users create apps with custom system prompts & LLM settings, (3) Remove the "Assistant" sidebar tab and make it an "App Playground" inside each app, (4) Remove the retrieval mode picker and all ingestion/ingest logic, (5) Move repository selection into Knowledge Bases, and (6) Show "Coming Soon" for unimplemented platforms.

---

## Summary of Changes

### 1. Integrations → Connect-only (no repo selection)

**Current**: After connecting to GitHub, the modal shows repositories to select. The integration card shows synced count.
**New**: After connecting, the integration card just shows **"Connected"** with a green dot. No repository selection step from integrations. The connector modal flow becomes: `auth → connected` (skip `select` and `ingest` stages for integrations). The "Manage" button is removed — only "Connect" / "Disconnect" remain.

### 2. New "Applications" Section

A new top-level nav item `Applications` (with a `LayoutGrid` or `AppWindow` icon) will be added to the sidebar. When clicked:

- **List view**: Shows all user-created apps as cards (name, description, linked KB count, creation date)
- **Create app**: A button to create a new app with a name & optional description
- **App detail page**: When clicking an app card, the user enters the app page which has three tabs:
  - **Playground** tab — the full chat experience, scoped to the app's linked KBs and using the app's LLM settings
  - **Knowledge Bases** tab — connect/disconnect KBs to this app. Only connected KBs are used as context in the playground
  - **Settings** tab — system prompt, model selection, temperature, max tokens

### 3. Remove "Assistant" Tab → "App Playground" inside App

- The sidebar nav removes the `Assistant` / `chat` entry
- The chat interface (input box, messages, reasoning, etc.) moves into the "App Playground" tab inside each individual app
- When a user navigates to an app and selects "Playground", they get the full chat experience scoped to that app's settings

### 4. Remove Retrieval Mode Picker & Ingestion Logic

**Current**: The chat input box has a retrieval mode picker (`Normal` / `Deep` / `Hyper`) and the connector modal has a 3-stage flow (`auth → select → ingest`) with animated ingestion progress bars.

**What gets removed**:
- `CHAT_MODELS` array and `modeIcon()` function (retrieval depth modes)
- The model picker dropdown in the chat input box (the `Normal` / `Deep` / `Hyper` selector)
- `currentModel` state and its persistence to localStorage
- The `connectorStage === 'select'` panel (item checkbox list with search)
- The `connectorStage === 'ingest'` panel (progress bars, extraction animation)
- `SAMPLE_ITEMS` fallback data and the `fetchItems()` function
- `startIngestion()` function and `ingestProgress` state
- `availableItems`, `selectedItemIds`, `itemQuery` state variables
- The `toggleItem()` helper

**What stays**:
- `connectorStage === 'auth'` panel (the authorization/OAuth flow) — this is the only stage needed for Integrations
- After auth completes, the connector immediately saves as `connected: true` (no item selection)
- The connector modal closes after successful auth

### 5. Move Repositories into Knowledge Base

- In the Knowledge Base detail → **Sources** tab, currently shows connected platforms with "Attach" / "Detach"
- This is already partially done — the Sources tab in KB already lets you attach platform items
- What changes: The integration connector modal no longer has `select` / `ingest` stages. Instead, repository/item selection happens exclusively through Knowledge Base → Sources → "Attach" flow
- The existing `attachSource` / `detachSource` in KnowledgeBases.tsx already handles this

### 6. Coming Soon for Unimplemented Platforms

**Implemented** (have real OAuth): `github`, `jira`, `gdocs`, `gslides`, `gsheets`, `gcal`
**Not implemented** (show Coming Soon): `slack`, `salesforce`

- These platforms' cards in Integrations will show a "Coming Soon" badge
- The "Connect" button will be disabled with reduced opacity
- The same treatment in the Settings → Connections tab

---

## Proposed Changes

### Types ([MODIFY] [types.ts](file:///Users/swarnendubhandari/My%20Space/Projects/hyper-space-2/web/src/types.ts))
- Add `'applications'` to `ActiveScreen` union type
- Add `Application` interface:
  ```ts
  interface Application {
    id: string;
    name: string;
    description?: string;
    systemPrompt: string;
    model: string;          // e.g. 'gemini-2.5-flash'
    temperature: number;    // 0.0–1.0
    maxTokens: number;
    linkedKbIds: string[];  // IDs of connected Knowledge Bases
    messages: Message[];    // isolated chat history for this app
    createdAt: string;
    updatedAt: string;
  }
  ```

---

### Sidebar Navigation ([MODIFY] [App.tsx](file:///Users/swarnendubhandari/My%20Space/Projects/hyper-space-2/web/src/App.tsx))

In `renderSidebarContent()`:
- Remove `{ id: 'chat', label: 'Assistant', Icon: MessagesSquare }` from nav items
- Add `{ id: 'applications', label: 'Applications', Icon: LayoutGrid }` between Dashboard and Knowledge
- Keep Dashboard, Knowledge, Integrations

---

### Integrations Page ([MODIFY] [App.tsx](file:///Users/swarnendubhandari/My%20Space/Projects/hyper-space-2/web/src/App.tsx))

In `renderIntegrations()`:
- Add `IMPLEMENTED_PLATFORMS` array: `['github', 'jira', 'gdocs', 'gslides', 'gsheets', 'gcal']`
- For platforms NOT in this array (slack, salesforce):
  - Show "Coming Soon" badge instead of "Not connected"
  - Disable the "Connect" button with opacity-40 and `cursor-not-allowed`
- For connected platforms: Just show "Connected" badge
- Remove "Manage" button, keep only "Connect" / "Disconnect"
- When "Connect" is clicked: Go through OAuth auth → on return, just mark as connected (no item selection)

In Connector Modal:
- **Remove** `select` and `ingest` stages entirely (panels + state + functions)
- Keep only `auth` stage
- After `auth` completes, directly `saveConnector(platformId, { connected: true, account: ... })` and close modal
- For real OAuth: on callback return, save connected state (no item picker)
- For simulated: after the timeout, save connected and close

Remove from App.tsx:
```diff
- const [availableItems, setAvailableItems] = useState<ConnectorItem[]>([]);
- const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
- const [itemQuery, setItemQuery] = useState('');
- const [ingestProgress, setIngestProgress] = useState<IngestProgress>({});
- const [currentModel, setCurrentModel] = useState<ChatModelId>('normal');
- const CHAT_MODELS array
- const modeIcon() function
- const SAMPLE_ITEMS object
- fetchItems() function
- toggleItem() function  
- startIngestion() function
- Connector modal select/ingest JSX panels
- Model picker dropdown in renderInputBox()
```

In Settings → Connections tab:
- Same changes: Coming Soon for slack/salesforce, disable buttons
- Show "Connected" status, no item counts

---

### Applications Section ([MODIFY] [App.tsx](file:///Users/swarnendubhandari/My%20Space/Projects/hyper-space-2/web/src/App.tsx))

Add new state and functions:
- `applications: Application[]` state (persisted to localStorage)
- `activeAppId: string | null` state  
- `appTab: 'playground' | 'knowledge' | 'settings'` state
- CRUD functions for applications (local state + localStorage)
- `renderApplications()` function with:
  - **List view**: Grid of app cards showing name, description, linked KB count + "Create Application" button
  - **Detail view**: Three-tab layout:

#### Playground tab
- The full chat experience (input box, messages, reasoning) **scoped to this app**
- Each app has its own `messages[]` array (isolated chat history)
- When sending a message, the API call includes:
  - The app's `systemPrompt` as the system message
  - The app's `linkedKbIds` so the backend queries only those KBs
  - The app's `model` and `temperature` settings
- The chat input box no longer has a KB scope picker or retrieval mode picker — those are defined in the app's settings/KB tab

#### Knowledge Bases tab
- Shows a list of all existing KBs with checkboxes
- KBs that are linked to this app are checked / highlighted with an "Attached" badge
- User can **link** (attach) or **unlink** (detach) any KB
- Linked KBs define the **scope** of the app's playground: only data from those KBs is used as context
- If no KBs are linked, the playground works without KB-specific context (general LLM only)
- The KB list is fetched from the existing `/api/kb` endpoint

#### Settings tab
- **System Prompt**: Large textarea for customizing the AI's behavior/persona
- **Model**: Dropdown selector (e.g. `gemini-2.5-flash`, `gpt-4o`, etc.)
- **Temperature**: Slider (0.0–1.0)
- **Max Tokens**: Number input
- Save button persists to localStorage

---

### Knowledge Base Sources ([MODIFY] [KnowledgeBases.tsx](file:///Users/swarnendubhandari/My%20Space/Projects/hyper-space-2/web/src/KnowledgeBases.tsx))

- In the Sources tab, add the ability to select specific items (repos, projects, etc.) from connected platforms
- Currently `attachSource` attaches all synced items at once — enhance to let user pick individual items
- Add a selection UI with search, checkboxes, select all — similar to the old connector `select` stage but now living inside KB Sources
- This becomes the **only** place to pick specific repositories / projects / channels

> [!NOTE]  
> The Sources tab already has attach/detach functionality. The key change is that this becomes the **only** place to select specific items (repositories, projects, etc.) — integrations are purely for authorization.

---

## Open Questions

> [!IMPORTANT]
> 1. **App Playground scope**: Each application's chat is **completely isolated** — separate chat history, system prompt, model, and KB scope per app.

> [!IMPORTANT]
> 2. **Application persistence**: Apps (including their messages and linked KBs) will be saved via **localStorage** for now since there's no existing `/api/apps` endpoint.

> [!IMPORTANT]
> 3. **Knowledge Base item selection**: I'll add a picker inside KB Sources to select specific repos/items from connected platforms (since that flow is being removed from integrations).

> [!IMPORTANT]
> 4. **App ↔ KB linking**: When an app sends a chat message, the `linkedKbIds` array is passed to the `/api/chat` endpoint so the backend can scope its retrieval to only those KBs. This reuses the existing `kbId` parameter but extends it to support multiple KBs.

---

## Verification Plan

### Automated Tests
- Build the app with `npm run dev` and verify no compilation errors
- Browser-test all navigation flows:
  - Sidebar: Dashboard → Applications → Knowledge → Integrations
  - Applications: Create app → Open app → Playground tab (chat works) → Settings tab
  - Integrations: Connect shows auth modal → after connecting shows "Connected" → Disconnect works
  - Integrations: Slack/Salesforce show "Coming Soon" with disabled button
  - Knowledge Base: Sources tab → Select specific items from connected platforms

### Manual Verification
- Visual walkthrough of all changes via browser recording
