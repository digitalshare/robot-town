# Robot Town Agent Service

Python sidecar for one private Strands agent session per robot. Durable conversation memory is stored in Cognee Cloud under the `robot-town` dataset and `robot:<robot_id>` session IDs.

## Run locally

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# edit .env with your keys
uvicorn app:app --host 0.0.0.0 --port 8787
```

The frontend uses `VITE_ROBOT_AGENT_URL` when set, otherwise it derives the local sidecar URL. Never put the OpenAI or Cognee keys in frontend variables.

If `ROBOT_AGENT_TOKEN` is set in `agent-service/.env`, create a root `.env.local` with the same shared token:

```env
VITE_ROBOT_AGENT_URL=http://localhost:8787
VITE_ROBOT_AGENT_TOKEN=the_same_token
```

## Sandbox

Start the service from `/home/user/robot-town` with port `8787`. For a Novita sandbox, expose the frontend with port `5173` and the agent service with port `8787`; the frontend derives the matching sandbox hostname automatically when `VITE_ROBOT_AGENT_URL` is not set.

Set `ROBOT_AGENT_TOKEN` only when the frontend is configured with the matching `VITE_ROBOT_AGENT_TOKEN`. For a public deployment, replace this prototype token approach with user authentication before exposing the endpoint.
