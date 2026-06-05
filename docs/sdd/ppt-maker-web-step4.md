# PPT Maker Web Step 4 SDD

## Scope

Step 4 creates the React single-column frontend for the existing platform content area. It consumes the Step 2/3 backend contracts and does not modify platform navigation.

## UI Structure

Top to bottom:

1. Sticky prompt composer with textarea, advanced parameter disclosure, PPTX upload, and Generate/Cancel action.
2. Conditional template candidate banner with three previews, select buttons, and a "换一批" control placeholder.
3. Conditional four-step progress indicator: selecting template, generating outline, building PPTX, quality check.
4. Preview panel with empty state, structured slide outline, and PPTX download action.
5. Collapsible history list with preview, download, and delete action placeholders.
6. Fixed authorization statement at the page bottom.

## Styling Contract

The app uses Tailwind classes that resolve to CSS variables only. Visual attributes such as colors, font family, radius, spacing scale, borders, focus rings, and shadows are exposed through `theme.css` variables. Component classes reference Tailwind theme tokens such as `bg-surface`, `text-foreground`, `rounded-ui`, and `shadow-panel`.

## Frontend State

`usePptGeneration` owns WebSocket state:

- `idle`
- `selecting_template`
- `generating_outline`
- `building_pptx`
- `quality_check`
- `complete`
- `error`
- `cancelled`

Initialization calls:

- `GET /api/generate/status`
- `GET /api/files`

If status returns `in_progress: true`, the UI shows the progress indicator and keeps the Generate button in Cancel mode. A new WebSocket connection is opened only when the user starts or cancels through the UI in this slice.

## API Contract

HTTP uses Axios:

- `getStatus()`
- `getFiles()`
- `getPreview(fileId)`
- `uploadTemplate(file)`
- `cancelGeneration()`
- `deleteFile(fileId)`

WebSocket uses native `WebSocket`:

- `generate(payload)`
- `selectTemplate(slug)`
- `cancel()`

## Test Targets

React tests use Vitest + Testing Library. They mock Axios and WebSocket to verify behavior without a live backend:

- Initial load renders empty preview and history count.
- Generate sends the documented WebSocket payload and flips the action to Cancel.
- Template candidates render and selecting one sends `select_template`.
- Progress events update the stepper and complete events render preview/download.
- Cancel sends the WebSocket cancel event and calls `/api/generate/cancel`.
- History delete calls the delete API and refreshes the file list.
