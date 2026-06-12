"""FastAPI app for Nano Harness."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .codegen import generate_python
from .runtime import run_graph
from .schema import CodegenRequest, CodegenResponse, RunRequest, RunResponse, TemplateSummary
from .templates import get_template, template_summaries

app = FastAPI(title="Nano Harness API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/templates", response_model=list[TemplateSummary])
def list_templates() -> list[TemplateSummary]:
    return template_summaries()


@app.get("/templates/{template_id}")
def read_template(template_id: str):
    try:
        return get_template(template_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/run", response_model=RunResponse)
def run(request: RunRequest) -> RunResponse:
    return run_graph(request.graph)


@app.post("/generate-code", response_model=CodegenResponse)
def generate_code(request: CodegenRequest) -> CodegenResponse:
    return CodegenResponse(code=generate_python(request.graph))
