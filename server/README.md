# Robot Town API and MCP server

Exposes the command functions (`/building`, `/space`, `/object`) outside the browser. Both servers are generated from the `FUNCTIONS` registry in `src/ai/functions.js`: adding an entry there (with `input`, `args`, `extract`, `validate`) adds `POST /api/functions/<id>` and an MCP tool named after its `tool` automatically.

Each call is stateless: it returns a validated spec and does not touch the browser's saved town.

## Configure the model

```env
ROBOT_TOWN_AI_PROTOCOL=openai   # openai | anthropic | google
ROBOT_TOWN_AI_BASE_URL=         # optional
ROBOT_TOWN_AI_API_KEY=...
ROBOT_TOWN_AI_MODEL=...
ROBOT_TOWN_API_TOKEN=...        # optional bearer token for the HTTP API
```

## HTTP API

`npm run serve:api` (port `PORT`, default 8788)

- `GET /api/functions` lists functions and input schemas
- `POST /api/functions/building` `{ "request": "a lookout tower" }`
- `POST /api/functions/space` `{ "request": "...", "building": { "name": "...", "footprint": [14, 12] }, "current_space": {...} }`
- `POST /api/functions/object` `{ "request": "...", "building": {...}, "objects": [...], "source": {...} }`

## MCP

`npm run serve:mcp` speaks MCP over stdio, e.g. `{"command":"node","args":["server/mcp.mjs"]}` with the env above. Tools: `create_building`, `create_space`, `create_object`.

Check with `npm run verify:server`.
