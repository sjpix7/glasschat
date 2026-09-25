# Glasschat

A small, readable LangChain chatbot with FastAPI, React, streamed Markdown replies, and a purple/blue glassmorphism interface. Switch between OpenAI, Anthropic, Google Gemini, and local Ollama from the sidebar. No database or account setup.

## Start with Docker

Install Docker with Compose, extract this project, and run from this folder:

```bash
docker compose up --build
```

Open **http://localhost:8000**. Choose a provider, enter a model ID available to your account and its API key, then send a message. On a phone-sized screen, the sliders button opens settings. Settings are locked during generation; use Stop before switching providers.

```bash
docker compose down
```

The multi-stage Dockerfile builds React and copies it into a single Python runtime container. FastAPI serves the frontend and `/api` on port 8000. The default Compose port is bound to your computer's loopback interface.

## Ollama on your computer

1. Install Ollama: https://ollama.com/download
2. Download a model, for example: `ollama pull llama3.2`
3. Ensure the Ollama server is running. Select **Ollama** in Glasschat.
4. Model name: `llama3.2` (or the exact installed name from `ollama list`).
5. URL from Docker: `http://host.docker.internal:11434`. No API key is needed.

The container has its own localhost. `http://localhost:11434` inside Docker does not reach your host's Ollama. Compose includes the host-gateway mapping needed on Linux. Ollama must listen on an interface reachable from Docker; if connection fails, stop the existing Ollama server and start it with `OLLAMA_HOST=0.0.0.0:11434 ollama serve` (macOS/Linux). Restrict port 11434 to trusted local/Docker traffic with your firewall. Do not expose Ollama to the internet. On Windows, set the OLLAMA_HOST environment variable and restart Ollama. Ollama itself and model weights are not included in the app image.

For a different trusted Ollama machine, add its exact hostname/IP to `OLLAMA_ALLOWED_HOSTS` in compose.yaml, restart the container, and enter that URL in the UI. Only http/https origin URLs (no path, credentials, query, or fragment) are accepted; redirects are disabled.

## Local development

Python 3.12 and Node 22+ are recommended.

```bash
python -m venv .venv
source .venv/bin/activate
# Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
uvicorn backend.app:app --reload --port 8000
```

In a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open the Vite URL (usually http://localhost:5173). Vite proxies `/api` to FastAPI. For Ollama without Docker, use `http://localhost:11434`.

## Understand the code

- `frontend/src/main.jsx`: connection form, chat history, Markdown rendering, streaming fetch, cancellation.
- `frontend/src/style.css`: translucent panels, backdrop blur, faint borders, purple/blue orbs, responsive layout.
- `backend/app.py`: input validation, provider factory, LangChain messages and streaming endpoint.
- `backend/tests/test_app.py`: request validation, secret redaction, adapter creation, streaming and history checks.
- `Dockerfile`: React build stage + non-root Python runtime.

A message follows this path:

1. React sends provider settings and conversation history to `POST /api/chat`.
2. FastAPI validates the request and constructs the selected LangChain chat adapter.
3. User/assistant entries become `HumanMessage` / `AIMessage` objects; instructions become a `SystemMessage`.
4. `model.astream(messages)` produces chunks, returned as newline-delimited JSON.
5. React decodes complete lines and updates the assistant bubble as text arrives.

NDJSON events: `{"type":"token","text":"..."}`, `{"type":"done"}`, or `{"type":"error","message":"..."}`. Validation errors use HTTP 422. Provider errors arrive in the stream, since HTTP headers may already have been sent.

## Behavior and limits

- Model configuration and API keys are preserved in browser localStorage across refreshes and per provider. Conversation history is held in memory only during the session. New conversation clears history; changing provider switches to that provider's saved model/key.
- Switching provider sends prior successful turns to the newly selected provider on your next message. Partial/failed assistant replies are excluded from subsequent requests.
- Keys are stored in browser localStorage for convenience across refreshes and travel through the backend to the selected provider. They are never logged by app code. Use HTTPS if you adapt this for remote access.
- This is a single-user local starter, without authentication or rate limiting. Add those and restrict Ollama network access before any shared deployment.
- Cloud providers may charge for API calls. You supply your own API credentials and valid model ID. No model list is hard-coded because availability varies by account.
- Responses have a 180-second overall timeout; input is limited to 100 messages and 150,000 characters. These are app limits, not token counts; a model's context window may be smaller.
- No RAG, database, persistent chat, uploads, or agent tools are included. This keeps the core LangChain flow easy to learn.
- Markdown is rendered without enabling raw HTML.

## Tests

```bash
pip install pytest httpx
python -m pytest backend/tests -q
cd frontend
npm run build
```

Official adapter documentation: https://reference.langchain.com/python/integrations/overview

## Validation of this package

- Eight backend tests passed, including construction of all four real LangChain adapters without network calls.
- React/Vite production build passed.
- Cloud/Ollama live inference was not run: no user API credentials or local model server were supplied.
- Docker image build was not run: Docker is unavailable in the authoring environment.
- Automated browser/visual checks could not run because the browser binary download failed. The responsive interface still needs a browser smoke test on your computer.
