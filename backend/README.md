# YoPagoCL

## Development

1. Install the dependencies
```bash
uv sync
```

2. Create a `.env` file with the required environment variables (see `core/config.py` for details)

3. Run the development server
```bash
uv run uvicorn main:app --reload
```

Or using FastAPI CLI:
```bash
uv run fastapi dev main.py
```

The server will be available at `http://localhost:8000`