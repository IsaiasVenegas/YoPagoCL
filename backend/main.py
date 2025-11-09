import logging
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from core.config import settings
from starlette.middleware.sessions import SessionMiddleware
from api.routers import v1_router


app = FastAPI(title="YoPagoCL API", version="0.1.0")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Exception handler for validation errors (422)
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    body = await request.body()
    logger.error(f"[422 Validation Error] Path: {request.url.path}")
    logger.error(f"[422 Validation Error] Method: {request.method}")
    logger.error(f"[422 Validation Error] Headers: {dict(request.headers)}")
    logger.error(f"[422 Validation Error] Body: {body.decode('utf-8') if body else 'Empty'}")
    logger.error(f"[422 Validation Error] Errors: {exc.errors()}")
    logger.error(f"[422 Validation Error] Full exception: {exc}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": exc.errors(), "body": body.decode('utf-8') if body else None},
    )

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Session middleware
app.add_middleware(SessionMiddleware, secret_key=settings.SECRET_KEY)

# API v1 routes
app.include_router(v1_router.routes, prefix="/api")

@app.get("/")
def read_root():
    return {"message": "YoPagoCL API", "version": "0.1.0"}