"""
LangGraph-based agent that answers natural-language questions about a
codebase by combining Neo4j graph queries with FAISS semantic search.
Uses Groq's llama-3.3-70b-versatile as the underlying LLM.
"""
import logging
from typing import Annotated, List, TypedDict

from langchain_core.messages import AnyMessage, HumanMessage, SystemMessage
from langchain_core.tools import tool
from langchain_groq import ChatGroq
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential
from groq import RateLimitError
from app.config import settings
from app.core.ai.prompts import SYSTEM_PROMPT, SYSTEM_PROMPT_NO_SEMANTIC_SEARCH
from app.core.graph.neo4j_client import neo4j_client
from app.core.search.hybrid_search import hybrid_search

logger = logging.getLogger("helix.agents")

_FORBIDDEN_KEYWORDS = ("CREATE", "MERGE", "DELETE", "SET", "DROP", "REMOVE", "DETACH")


class AgentState(TypedDict):
    messages: Annotated[List[AnyMessage], add_messages]
    repo_id: str


def _build_tools(repo_id: str):
    @tool
    async def semantic_search(query: str, top_k: int = 8) -> str:
        """Find functions/classes in the codebase semantically related to a natural-language query."""
        if not settings.ENABLE_EMBEDDINGS:
            return "Semantic search is currently disabled for this deployment."
        try:
            results = await hybrid_search.search(query, repo_id=repo_id, top_k=top_k)
        except Exception as exc:
            logger.exception("semantic_search tool failed for repo %s", repo_id)
            return f"Semantic search failed: {exc}"
        if not results:
            return "No relevant code entities found."
        return "\n".join(f"- {r.type} `{r.name}` in {r.file_path} (score={r.score:.3f})" for r in results)
    @tool
    async def query_graph(cypher: str) -> str:
        """
        Run a READ-ONLY Cypher query against the Neo4j code knowledge graph
        for this repository. The query must not contain CREATE, MERGE, DELETE,
        SET, DROP or REMOVE, and should filter on repo_id = $repo_id.
        """
        upper = cypher.upper()
        if any(kw in upper for kw in _FORBIDDEN_KEYWORDS):
            return "Rejected: only read-only Cypher queries are permitted."
        try:
            rows = await neo4j_client.execute_read(cypher, {"repo_id": repo_id})
        except Exception as exc:
            logger.exception("Agent Cypher query failed.")
            return f"Query failed: {exc}"
        if not rows:
            return "Query returned no results."
        truncated = rows[:15]
        text = "\n".join(str(row) for row in truncated)
        if len(rows) > 15:
            text += f"\n... ({len(rows) - 15} more rows omitted for brevity)"
        return text

    if settings.ENABLE_EMBEDDINGS:
        return [semantic_search, query_graph]
    return [query_graph]


def _build_graph(repo_id: str):
    if not settings.GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not configured.")

    llm = ChatGroq(
        model=settings.GROQ_MODEL,
        api_key=settings.GROQ_API_KEY,
        temperature=settings.GROQ_TEMPERATURE,
        max_tokens=4096,
        reasoning_effort="low",
    )
    tools = _build_tools(repo_id)
    llm_with_tools = llm.bind_tools(tools)

    @retry(
        retry=retry_if_exception_type(RateLimitError),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True,
    )
    async def _invoke_with_retry(messages):
        return await llm_with_tools.ainvoke(messages)

    async def agent_node(state: AgentState):
        messages = state["messages"]
        if not any(isinstance(m, SystemMessage) for m in messages):
            active_prompt = SYSTEM_PROMPT if settings.ENABLE_EMBEDDINGS else SYSTEM_PROMPT_NO_SEMANTIC_SEARCH
            messages = [SystemMessage(content=active_prompt), *messages]
        response = await _invoke_with_retry(messages)
        return {"messages": [response]}

    def should_continue(state: AgentState) -> str:
        last = state["messages"][-1]
        if getattr(last, "tool_calls", None):
            return "tools"
        return END

    graph = StateGraph(AgentState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", ToolNode(tools))
    graph.set_entry_point("agent")
    graph.add_conditional_edges("agent", should_continue, {"tools": "tools", END: END})
    graph.add_edge("tools", "agent")
    return graph.compile()


async def run_agent_query(question: str, repo_id: str) -> str:
    """Execute the LangGraph agent for a single question, returning the final answer text."""
    if not settings.GROQ_API_KEY:
        return "GROQ_API_KEY is not configured; the AI assistant is unavailable."

    try:
        compiled_graph = _build_graph(repo_id)
        result = await compiled_graph.ainvoke(
            {"messages": [HumanMessage(content=question)], "repo_id": repo_id},
            config={"recursion_limit": 30},
        )
        final_message = result["messages"][-1]
        content = getattr(final_message, "content", None)

        if content:
            return content

        # Content came back empty — log everything about the final message so
        # we can see whether this is a reasoning-only response, a truncated
        # response, or something else entirely.
        reasoning = getattr(final_message, "additional_kwargs", {}).get("reasoning_content") or \
                    getattr(final_message, "additional_kwargs", {}).get("reasoning")
        logger.warning(
            "Agent finished with empty content for repo %s. type=%s tool_calls=%s "
            "additional_kwargs=%s response_metadata=%s",
            repo_id,
            type(final_message).__name__,
            getattr(final_message, "tool_calls", None),
            getattr(final_message, "additional_kwargs", None),
            getattr(final_message, "response_metadata", None),
        )
        if reasoning:
            return f"[No final answer text was returned, only reasoning. Debug — reasoning content: {reasoning[:1500]}]"
        finish_reason = (getattr(final_message, "response_metadata", {}) or {}).get("finish_reason")
        return f"I couldn't generate an answer. Debug: empty content, finish_reason={finish_reason}"
    except Exception as exc:
        logger.exception("Agent execution failed for repo %s", repo_id)
        return f"Sorry, I ran into an error trying to answer that question. Debug: {type(exc).__name__}: {exc}"
