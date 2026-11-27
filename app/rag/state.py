from typing import List , Literal
from typing_extensions import TypedDict
from pydantic import BaseModel , Field
from langchain_core.documents import Document

class RouteDecision(BaseModel):
    route: Literal["kb" , "direct"] = Field(... , description="The route to take: 'kb' for knowledge base or 'direct' for direct response.")

class EvidenceGrade(BaseModel):
    grade: Literal["good" , "weak"] = Field(... , description="The grade of the evidence: 'good' or 'weak'.")
    
# The state of the agent
class AgentState(TypedDict):
    question: str
    current_query: str
    kb_docs: List [Document]
    web_results: str
    kb_grade: str
    web_grade: str
    answer: str
    source_used: str
    retry_count: int
    trace: List[str]
    citations: List[dict]