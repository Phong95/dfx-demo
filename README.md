# DXF Demo

A DXF file processing tool for civil engineers who receive structural drawings and need to
clean them up before adding their own work. The application combines a web-based DXF viewer
(React + TypeScript) with an MCP server that lets Claude Desktop assist with intelligent
cleanup operations. Browse the DXF structure, select layers or object types to clean, describe
your intent to Claude, and export the cleaned DXF file.

## Getting Started

```bash
npm install
npm run dev
```

`npm run dev` starts both the Vite dev server (the browser app, default `http://localhost:5173`)
and the Engine Server (a local WebSocket host on `ws://127.0.0.1:4000` that owns the in-memory
Document Model both the browser and Claude Desktop read from/write to).

Open the app in your browser and load a DXF file. At this point the app works exactly as it did
in Phase 1/2 -- browse layers, select entities, delete/hide, undo/redo, export -- with no
dependency on Claude Desktop at all. The Engine Server sync (below) is additive.

## Claude Desktop Configuration

Once `npm run dev` is running, Claude Desktop can connect to the same drawing session over a
separate MCP server process. Add the following to your `claude_desktop_config.json`
(`%APPDATA%\Claude\claude_desktop_config.json` on Windows, `~/Library/Application
Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "dxf-demo": {
      "command": "npx",
      "args": [
        "tsx",
        "--tsconfig",
        "<ABSOLUTE_PATH_TO_REPO>/tsconfig.server.json",
        "<ABSOLUTE_PATH_TO_REPO>/src/server/index.ts"
      ]
    }
  }
}
```

Replace `<ABSOLUTE_PATH_TO_REPO>` with the absolute path to your clone of this repository (e.g.
`D:/Github/dxf-demo` on Windows or `/Users/you/dxf-demo` on macOS). Claude Desktop spawns this
process with its own working directory, which is not guaranteed to be the project root, so a
relative path will not reliably resolve -- always use the absolute path.

If your Engine Server is running on a non-default port (see below), add an `env` block so the
MCP relay process connects to the same port:

```json
{
  "mcpServers": {
    "dxf-demo": {
      "command": "npx",
      "args": [
        "tsx",
        "--tsconfig",
        "<ABSOLUTE_PATH_TO_REPO>/tsconfig.server.json",
        "<ABSOLUTE_PATH_TO_REPO>/src/server/index.ts"
      ],
      "env": {
        "ENGINE_PORT": "4000"
      }
    }
  }
}
```

After saving the config, restart Claude Desktop. With a DXF file loaded in the browser, you can
now ask Claude to inspect and clean up the drawing -- for example:

- "List the layers in this drawing."
- "Show me the structure of this drawing, including any unknown entity types."
- "Delete everything on the S-DIMS layer." (Claude previews the change and asks you to confirm
  before anything is applied.)
- "Export the cleaned drawing to `C:/drawings/cleaned.dxf`."

### Available MCP Tools

| Tool | Purpose |
|------|---------|
| `list_layers` | Layer names, resolved colors, live entity counts, frozen/locked state |
| `get_structure` | Layer > entity-type > count tree, plus the unknown-entity report |
| `apply_cleanup_rule` | Preview a delete/hide rule by layer and/or entity type filter -- returns a `proposal_id` |
| `remove_selection` | Preview a delete/hide of specific entity indices -- returns a `proposal_id` |
| `confirm_proposal` | Apply a previously previewed proposal by its `proposal_id` |
| `export_dxf` | Write the cleaned drawing to a file path (surgical export, byte-for-byte preservation of untouched content) |

`apply_cleanup_rule` and `remove_selection` never apply a change directly -- they always return a
preview and a `proposal_id` first. Nothing destructive happens until `confirm_proposal` is called
with that id, and a stale proposal (the drawing changed since the preview) is rejected rather than
silently applied.

### Engine Server Port

The Engine Server binds `ws://127.0.0.1:4000` by default. To use a different port, set
`ENGINE_PORT` before running `npm run dev`, and set the matching `env.ENGINE_PORT` in your
`claude_desktop_config.json` (above) so both processes agree on the port.

```bash
ENGINE_PORT=4321 npm run dev
```

### Troubleshooting

- **Claude reports "Cannot reach the DXF Demo engine server"** -- make sure `npm run dev` is
  running. Claude Desktop's MCP relay process is stateless and only relays tool calls to the
  already-running Engine Server; it does not start one itself.
- **Claude reports "No drawing loaded"** -- load a DXF file in the browser first. The Engine
  Server's Document Model mirrors whatever the browser has loaded.
