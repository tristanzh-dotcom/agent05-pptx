# PPT Maker Web Generation State Persistence SDD

## Problem

Agent05 generation state is currently coupled to the browser WebSocket connection. Switching to another agent page or refreshing the page tears down the frontend component, closes the WebSocket, and the backend treats `WebSocketDisconnect` as task cancellation. The running task is cancelled and the public status snapshot is cleared.

This violates the expected agent shell behavior: navigation is a viewer lifecycle event, not a job lifecycle event.

## Interface Boundary

### Backend Task Lifecycle

- A generation task is owned by `TaskManager`.
- A WebSocket connection is only a control and event delivery channel for the active viewer.
- `WebSocketDisconnect` must not set the task `cancel_event`.
- `WebSocketDisconnect` must not clear the active status snapshot.
- The task may only be cancelled by an explicit cancel control event or `POST /api/generate/cancel`.
- `GET /api/generate/status` remains the recovery interface for active task state.

### Frontend Recovery

- On mount, the frontend reads `GET /api/generate/status` and `GET /api/files`.
- If status reports `in_progress: true`, the UI restores the progress panel using `stage` and `message`.
- When the page was restored without an active WebSocket, the frontend polls status until the task ends.
- After the task ends, the frontend refreshes file history and previews the latest generated file when a preview is available.
- User-entered generation parameters are persisted in `localStorage` so prompt, page count, style, purpose, and custom template path survive reload and agent navigation.

## Cancellation Contract

| Event | Backend behavior | Frontend behavior |
|---|---|---|
| Browser refresh | Continue active task | Restore form and active status |
| Switch to another agent | Continue active task | Restore form and active status when returning |
| WebSocket network drop | Continue active task | Recover from status polling after remount |
| User clicks Cancel | Set `cancel_event`, clear task snapshot | Show cancelled state |
| Generation completes while away | Finish task, generated file remains in history | Refresh files and preview latest output |

## Persistence Schema

`localStorage["ppt-maker:generation-form:v1"]`:

```json
{
  "prompt": "string"
}
```

Invalid or missing storage values fall back to the current defaults. Legacy `pageCount`, `style`, `purpose`, and `customTemplatePath` fields may remain in old browser storage, but the current UI ignores them.

## Tests

- Backend: receiving a `WebSocketDisconnect` from the control receiver does not set `cancel_event`.
- Frontend: an in-progress backend status restores the progress panel after mount.
- Frontend: persisted form values are restored after remount.
- Frontend: restored in-progress state polls status and refreshes files when the backend reports completion.
