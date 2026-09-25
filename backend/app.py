"""A small stateless chat API. Credentials are scoped to one request."""
import asyncio
import json
import os
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, SecretStr, model_validator
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_ollama import ChatOllama

app = FastAPI(title="Glasschat", docs_url="/api/docs", openapi_url="/api/openapi.json")

class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=32000)

class ChatRequest(BaseModel):
    provider: Literal["openai", "anthropic", "google", "ollama"]
    model: str = Field(min_length=1, max_length=160, pattern=r"^\S+$")
    api_key: SecretStr = SecretStr("")
    base_url: str = "http://host.docker.internal:11434"
    system_prompt: str = Field(default="You are a helpful, clear assistant.", max_length=4000)
    messages: list[Message] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def validate_config(self):
        if self.provider != "ollama" and not self.api_key.get_secret_value().strip():
            raise ValueError("An API key is required for this provider.")
        if self.messages[-1].role != "user":
            raise ValueError("The last message must be from the user.")
        if sum(len(m.content) for m in self.messages) > 150000:
            raise ValueError("Conversation is too long. Start a new chat.")
        if self.provider == "ollama":
            try:
                url = urlsplit(self.base_url)
                port = url.port
            except ValueError:
                raise ValueError("Invalid Ollama URL.") from None
            allowed = {h.strip().lower() for h in os.getenv(
                "OLLAMA_ALLOWED_HOSTS", "localhost,127.0.0.1,host.docker.internal,ollama"
            ).split(",")}
            if (url.scheme not in {"http", "https"} or url.hostname not in allowed
                    or url.username or url.password or url.query or url.fragment
                    or url.path not in {"", "/"}):
                raise ValueError("Ollama URL must use an allowed host and no path or credentials.")
        return self

@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    # Do not echo Pydantic's input objects: they can contain credentials.
    return JSONResponse(status_code=422, content={"detail": "; ".join(
        f"{'.'.join(str(x) for x in e['loc'])}: {e['msg']}" for e in exc.errors()
    )})

@app.middleware("http")
async def response_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response

def build_model(req: ChatRequest):
    key = req.api_key.get_secret_value().strip()
    if req.provider == "openai":
        return ChatOpenAI(model=req.model, api_key=key, stream_usage=True, timeout=120, max_retries=0)
    if req.provider == "anthropic":
        return ChatAnthropic(model=req.model, api_key=key, max_tokens=4096, timeout=120, max_retries=0)
    if req.provider == "google":
        return ChatGoogleGenerativeAI(model=req.model, api_key=key, max_retries=0)
    base_url = req.base_url.rstrip("/")
    if os.path.exists("/.dockerenv"):
        parsed = urlsplit(base_url)
        if parsed.hostname in {"localhost", "127.0.0.1"}:
            port = f":{parsed.port}" if parsed.port else ":11434"
            base_url = f"{parsed.scheme}://host.docker.internal{port}"
    return ChatOllama(model=req.model, base_url=base_url,
                      client_kwargs={"timeout": 120, "follow_redirects": False})

def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    words = len(text.strip().split())
    chars = len(text)
    return max(1, int(round((chars / 4.0 + words * 1.3) / 2.0)))

def extract_usage(chunk):
    usage = getattr(chunk, "usage_metadata", None)
    if usage and isinstance(usage, dict):
        inp = usage.get("input_tokens") or 0
        out = usage.get("output_tokens") or 0
        total = usage.get("total_tokens") or (inp + out)
        if inp or out or total:
            return {"prompt_tokens": inp, "completion_tokens": out, "total_tokens": total}
    resp_meta = getattr(chunk, "response_metadata", None)
    if resp_meta and isinstance(resp_meta, dict):
        if "prompt_eval_count" in resp_meta or "eval_count" in resp_meta:
            inp = resp_meta.get("prompt_eval_count", 0)
            out = resp_meta.get("eval_count", 0)
            return {"prompt_tokens": inp, "completion_tokens": out, "total_tokens": inp + out}
        usage = resp_meta.get("usage")
        if usage and isinstance(usage, dict):
            inp = usage.get("prompt_tokens") or usage.get("input_tokens") or 0
            out = usage.get("completion_tokens") or usage.get("output_tokens") or 0
            total = usage.get("total_tokens") or (inp + out)
            return {"prompt_tokens": inp, "completion_tokens": out, "total_tokens": total}
    return None

def text_content(content):
    if isinstance(content, str):
        return content
    return "".join(b.get("text", "") for b in content
                   if isinstance(b, dict) and b.get("type") == "text")

def event(kind, **kwargs):
    return json.dumps({"type": kind, **kwargs}) + "\n"

@app.get("/api/health")
async def health():
    return {"status": "ok"}

@app.post("/api/chat")
async def chat(req: ChatRequest, request: Request):
    print(f"[CHAT] Received request: provider={req.provider}, model={req.model}, base_url={req.base_url}", flush=True)
    async def generate():
        try:
            model = build_model(req)
            messages = [SystemMessage(content=req.system_prompt)] if req.system_prompt else []
            messages += [(HumanMessage if m.role == "user" else AIMessage)(content=m.content)
                         for m in req.messages]
            
            prompt_text = (req.system_prompt or "") + "".join(m.content for m in req.messages)
            estimated_prompt_tokens = estimate_tokens(prompt_text)
            accumulated_text = []
            captured_usage = None
            start_time = asyncio.get_event_loop().time()

            # Hard cap also covers providers without their own request timeout.
            async with asyncio.timeout(180):
                async for chunk in model.astream(messages):
                    if await request.is_disconnected():
                        return
                    text = text_content(chunk.content)
                    if text:
                        accumulated_text.append(text)
                        yield event("token", text=text)
                    chunk_usage = extract_usage(chunk)
                    if chunk_usage:
                        captured_usage = chunk_usage

            elapsed_sec = max(0.001, asyncio.get_event_loop().time() - start_time)
            full_reply = "".join(accumulated_text)

            if captured_usage:
                final_usage = {
                    "prompt_tokens": captured_usage.get("prompt_tokens") or estimated_prompt_tokens,
                    "completion_tokens": captured_usage.get("completion_tokens") or estimate_tokens(full_reply),
                    "total_tokens": captured_usage.get("total_tokens") or (
                        (captured_usage.get("prompt_tokens") or estimated_prompt_tokens) + 
                        (captured_usage.get("completion_tokens") or estimate_tokens(full_reply))
                    ),
                    "duration_sec": round(elapsed_sec, 2),
                }
            else:
                comp_tokens = estimate_tokens(full_reply)
                final_usage = {
                    "prompt_tokens": estimated_prompt_tokens,
                    "completion_tokens": comp_tokens,
                    "total_tokens": estimated_prompt_tokens + comp_tokens,
                    "duration_sec": round(elapsed_sec, 2),
                }

            yield event("done", usage=final_usage)
        except asyncio.CancelledError:
            raise
        except TimeoutError:
            print("[CHAT] Request timed out", flush=True)
            yield event("error", message="The model timed out. Try again or use a smaller local model.")
        except Exception as exc:
            print(f"[CHAT] Exception occurred: {type(exc).__name__}: {exc}", flush=True)
            err_str = str(exc).lower()
            if req.provider == "ollama" and "not found" in err_str:
                yield event("error", message=f"Model '{req.model}' is not pulled in Ollama. Run 'ollama pull {req.model}' or use an installed model.")
            elif req.provider == "ollama" and any(k in err_str for k in ["connect", "refused", "unreachable"]):
                yield event("error", message=f"Cannot reach Ollama at {req.base_url}. Make sure Ollama is running.")
            else:
                yield event("error", message="Provider request failed. Check your model name, key, quota, and connection. For Ollama, check that the model is pulled and the server is reachable.")
    return StreamingResponse(generate(), media_type="application/x-ndjson",
                             headers={"X-Accel-Buffering": "no"})

static = Path(os.getenv("STATIC_DIR", Path(__file__).parent / "static"))
if static.is_dir():
    app.mount("/", StaticFiles(directory=static, html=True), name="frontend")
