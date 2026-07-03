"""
Documentation Generator API routes — Phase 8.

Endpoints:
  POST /api/v1/docs/generate/{repo_id}
    body: { "doc_type": "readme" | "api" | "architecture" | "onboarding" }
    returns: { "content": "<markdown>", "mermaid": "<optional diagram>" }

curl examples:
  curl -X POST http://localhost:8001/api/v1/docs/generate/<repo_id> \
    -H "Content-Type: application/json" \
    -d '{"doc_type": "readme"}'

  curl -X POST http://localhost:8001/api/v1/docs/generate/<repo_id> \
    -H "Content-Type: application/json" \
    -d '{"doc_type": "architecture"}'

  curl -X POST http://localhost:8001/api/v1/docs/generate/<repo_id> \
    -H "Content-Type: application/json" \
    -d '{"doc_type": "onboarding"}'
"""
import logging
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.docs.doc_generator import DocGenerator

logger = logging.getLogger("helix.api.docs")
router = APIRouter()


class DocRequest(BaseModel):
    doc_type: Literal["readme", "api", "architecture", "onboarding"]


class DocResponse(BaseModel):
    doc_type: str
    content: str
    mermaid: Optional[str] = None


@router.post("/generate/{repo_id}", response_model=DocResponse)
async def generate_documentation(repo_id: str, payload: DocRequest):
    """
    Generate documentation for an ingested repository using the Neo4j
    knowledge graph + Groq LLM.

    doc_type options:
    - readme        : Full README.md with description, stack, usage
    - api           : API surface docs for all route/handler functions
    - architecture  : Module overview + Mermaid dependency diagram
    - onboarding    : Developer onboarding guide with entry points and data flow
    """
    generator = DocGenerator(repo_id=repo_id)
    try:
        result = await generator.generate(payload.doc_type)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("Doc generation failed for repo %s type %s", repo_id, payload.doc_type)
        raise HTTPException(status_code=500, detail=f"Documentation generation failed: {exc}")

    return DocResponse(
        doc_type=payload.doc_type,
        content=result.get("content", ""),
        mermaid=result.get("mermaid"),
    )
