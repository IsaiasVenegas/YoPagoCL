# YoPagoCL

## Development

1. Install the dependencies
```bash
uv sync
```

2. Create a `.env` file with the required environment variables (see `core/config.py` for details)

3. Run database migrations
```bash
uv run alembic upgrade head
```

4. Run the development server

For local development (accessible from mobile devices on the same network):
```bash
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Or using FastAPI CLI:
```bash
uv run fastapi dev main.py --host 0.0.0.0 --port 8000
```

For localhost only:
```bash
uv run uvicorn main:app --reload
```

## Database Migrations

To create a new migration:
```bash
uv run alembic revision --autogenerate -m "description of changes"
```

To apply migrations:
```bash
uv run alembic upgrade head
```

To rollback the last migration:
```bash
uv run alembic downgrade -1
```

The server will be available at:
- `http://localhost:8000` (from your machine)
- `http://YOUR_IP_ADDRESS:8000` (from mobile devices on the same network)