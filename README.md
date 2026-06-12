# Nano Harness

A small interactive harness playground built with React and Vite.

## Play Online

After this repository is published with GitHub Pages enabled, the app will be available at:

```text
https://<your-github-username>.github.io/<repo-name>/
```

## Run Locally

```bash
cd frontend
npm install
npm run dev
```

Then open the local URL printed by Vite.

## Build

```bash
cd frontend
npm run build
```

## Deploy

This repo includes a GitHub Actions workflow at `.github/workflows/deploy-pages.yml`.
Push to the `main` branch, then enable GitHub Pages in the repository settings with **GitHub Actions** as the source.
# Nano Harness

Nano Harness is a teaching-focused visual builder for understanding the core
parts of an AI harness. It lets users assemble a small harness from blocks,
run a built-in demo episode, inspect the trace, and view generated Python code.

The first version intentionally keeps the runtime small:

- A task block defines the question and expected answer.
- A policy block chooses actions from the current context.
- A memory block tracks candidate documents, curated evidence, and history.
- Tool blocks expose search, read, curate, verify, and finish actions.
- A context builder renders the prompt-like state.
- An evaluator scores the demo run and reports simple metrics.

## Layout

```text
nano-harness/
  backend/      FastAPI runtime, graph schema, templates, and code generation
  frontend/     React + React Flow visual builder
  examples/     Saved graph examples
  docs/         Teaching notes and concept mapping
```

## Run Locally

Backend:

```bash
cd backend
uv sync
uv run uvicorn nano_harness.api:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

The frontend expects the backend at `http://localhost:8000`.
