"""
Conversational AI endpoints backed by the LangGraph + Groq agent.
"""
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.ai.agents import run_agent_query

logger = logging.getLogger("helix.api.ai")
router = APIRouter()


class AskRequest(BaseModel):
    repo_id: str
    question: str


class AskResponse(BaseModel):
    answer: str


@router.post("/ask", response_model=AskResponse)
async def ask_question(payload: AskRequest):
    if not payload.question.strip():
        raise HTTPException(status_code=400, detail="Question must not be empty.")
    try:
        answer = await run_agent_query(payload.question, payload.repo_id)
    except Exception:
        logger.exception("Agent query failed for repo %s", payload.repo_id)
        raise HTTPException(status_code=500, detail="The AI assistant failed to answer the question.")
    return AskResponse(answer=answer)
