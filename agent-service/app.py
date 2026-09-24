"""Small Strands + Cognee Cloud sidecar for robot-town conversations."""

from __future__ import annotations

import asyncio
import os
import re
from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from strands import Agent
from strands.models.openai import OpenAIModel


load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))


MAX_MESSAGE_CHARS = 2000
MAX_MEMORY_CHARS = 5000
ROBOT_ID = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
ROBOT_TOWN_DATASET = "robot_town"


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def cognee_url(path: str) -> str:
    return f"{required_env('COGNEE_BASE_URL').rstrip('/')}{path}"


def robot_session_id(robot_id: str) -> str:
    return f"robot:{robot_id}"


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)
    robot: dict[str, Any] = Field(default_factory=dict)


class ChatResponse(BaseModel):
    robot_id: str
    text: str
    recalled: bool = False


@dataclass
class RobotAgent:
    agent: Agent
    lock: asyncio.Lock


app = FastAPI(title="Robot Town Agent Service", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ROBOT_AGENT_ALLOWED_ORIGINS", "*").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

agents: dict[str, RobotAgent] = {}
dataset_lock = asyncio.Lock()
dataset_ready = False


def authorize(authorization: str | None) -> None:
    expected = os.getenv("ROBOT_AGENT_TOKEN", "").strip()
    if expected and authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="Invalid agent service token")


def robot_system_prompt(robot_id: str, robot: dict[str, Any]) -> str:
    name = str(robot.get("name") or robot_id)[:80]
    kind = str(robot.get("type") or "unit")[:40]
    building = str(robot.get("building") or "the town")[:100]
    return (
        f"You are {name}, a resident robot in Robot Town. "
        f"Your robot type is {kind} and your home is {building}. "
        "Speak in first person as this robot. Be warm, concise, and grounded in the town. "
        "Never claim to control the simulation or perform actions you were not given. "
        "Your memories are private to you; do not imply knowledge of another robot's private conversations. "
        "When memory is supplied, treat it as personal recollection rather than guaranteed current truth. "
        "The stable robot ID, not a display-name change, determines which memories belong to you. "
        "If earlier turns are supplied, acknowledge that you have spoken before instead of claiming you have no recall."
    )


def get_agent(robot_id: str, robot: dict[str, Any]) -> RobotAgent:
    existing = agents.get(robot_id)
    if existing:
        return existing
    model = OpenAIModel(
        client_args={"api_key": required_env("OPENAI_API_KEY")},
        model_id=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        params={"max_tokens": 500, "temperature": 0.7},
    )
    created = RobotAgent(
        agent=Agent(model=model, system_prompt=robot_system_prompt(robot_id, robot)),
        lock=asyncio.Lock(),
    )
    agents[robot_id] = created
    return created


async def ensure_cognee_dataset() -> None:
    global dataset_ready
    if dataset_ready:
        return
    async with dataset_lock:
        if dataset_ready:
            return
        dataset = ROBOT_TOWN_DATASET
        headers = {"X-Api-Key": required_env("COGNEE_API_KEY")}
        async with httpx.AsyncClient(timeout=25) as client:
            listed = await client.get(cognee_url("/api/v1/datasets/"), headers=headers)
            listed.raise_for_status()
            names = {item.get("name") for item in listed.json() if isinstance(item, dict)}
            if dataset not in names:
                created = await client.post(
                    cognee_url("/api/v1/remember"),
                    headers=headers,
                    data={
                        "datasetName": dataset,
                        "raw_data": "Robot Town memory namespace marker. Do not use this as a conversational fact.",
                    },
                )
                created.raise_for_status()
        dataset_ready = True


async def cognee_recall(robot_id: str, message: str) -> str:
    headers = {"X-Api-Key": required_env("COGNEE_API_KEY")}
    dataset = ROBOT_TOWN_DATASET
    body = {
        "query": message,
        "session_id": robot_session_id(robot_id),
        "datasets": [dataset],
        "only_context": True,
        "scope": ["session"],
    }
    async with httpx.AsyncClient(timeout=25) as client:
        response = await client.post(cognee_url("/api/v1/recall"), headers=headers, json=body)
    # A freshly reset robot-town dataset does not exist until the first write.
    # Treat that expected first-run 404 as empty private memory.
    if response.status_code == 404:
        await ensure_cognee_dataset()
        return ""
    response.raise_for_status()
    return private_memory_text(response.json(), robot_id)


def private_memory_text(payload: Any, robot_id: str) -> str:
    """Render only explicitly tagged QA entries from this robot's session."""
    if not isinstance(payload, list):
        return ""

    marker = f"[robot_id={robot_id} "
    parts = []
    for item in payload:
        if not isinstance(item, dict) or item.get("source") != "session":
            continue
        question = item.get("question")
        answer = item.get("answer")
        if not isinstance(question, str) or not question.startswith(marker) or not isinstance(answer, str):
            continue
        parts.append(f"Earlier user: {question}\nRobot: {answer}")
    return "\n\n".join(parts)[:MAX_MEMORY_CHARS]


async def cognee_remember(robot_id: str, robot: dict[str, Any], question: str, answer: str) -> None:
    headers = {
        "X-Api-Key": required_env("COGNEE_API_KEY"),
        "Content-Type": "application/json",
    }
    body = {
        "entry": {
            "type": "qa",
            "question": (
                f"[robot_id={robot_id} robot_name={str(robot.get('name') or robot_id)[:80]}] "
                f"{question[:MAX_MESSAGE_CHARS]}"
            ),
            "answer": answer[:MAX_MEMORY_CHARS],
        },
        "dataset_name": ROBOT_TOWN_DATASET,
        "session_id": robot_session_id(robot_id),
    }
    async with httpx.AsyncClient(timeout=25) as client:
        response = await client.post(cognee_url("/api/v1/remember/entry"), headers=headers, json=body)
    response.raise_for_status()


@app.get("/health")
async def health() -> dict[str, Any]:
    configured = all(os.getenv(key, "").strip() for key in ("OPENAI_API_KEY", "COGNEE_BASE_URL", "COGNEE_API_KEY"))
    return {"ok": configured, "service": "robot-town-agent", "agents": len(agents)}


@app.post("/robots/{robot_id}/chat", response_model=ChatResponse)
async def chat(robot_id: str, request: ChatRequest, authorization: str | None = Header(default=None)) -> ChatResponse:
    authorize(authorization)
    if not ROBOT_ID.fullmatch(robot_id):
        raise HTTPException(status_code=400, detail="Invalid robot id")
    if request.robot.get("id") != robot_id:
        raise HTTPException(status_code=400, detail="Robot identity mismatch")

    robot_agent = get_agent(robot_id, request.robot)
    async with robot_agent.lock:
        try:
            memory = await cognee_recall(robot_id, request.message)
        except (httpx.HTTPError, RuntimeError) as exc:
            raise HTTPException(status_code=502, detail=f"Cognee recall failed: {exc}") from exc

        prompt = request.message
        if memory:
            prompt = (
                "Private memories for this robot are below. Use them when they answer the user, "
                "and do not say you cannot recall past conversations when relevant memory is present. "
                f"\n\n{memory}\n\nUser message:\n{request.message}"
            )
        try:
            result = await robot_agent.agent.invoke_async(prompt)
            answer = getattr(result, "output", None) or str(result)
        except Exception as exc:  # Strands providers expose provider-specific errors.
            raise HTTPException(status_code=502, detail=f"Agent response failed: {exc}") from exc

        try:
            await cognee_remember(robot_id, request.robot, request.message, answer)
        except (httpx.HTTPError, RuntimeError) as exc:
            raise HTTPException(status_code=502, detail=f"Cognee remember failed: {exc}") from exc

    return ChatResponse(robot_id=robot_id, text=answer, recalled=bool(memory))
