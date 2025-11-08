from datetime import timezone
from typing import Annotated, Any, Literal
from zoneinfo import ZoneInfo

from pydantic import BeforeValidator, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


def parse_cors(v: Any) -> list[str] | str:
    if isinstance(v, str) and not v.startswith("["):
        return [i.strip() for i in v.split(",")]
    elif isinstance(v, list | str):
        return v
    raise ValueError(v)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="./.env",
        env_ignore_empty=True,
        extra="ignore",
    )

    BACKEND_CORS_ORIGINS: Annotated[list[str] | str, BeforeValidator(parse_cors)]

    ENVIRONMENT: Literal["local", "staging", "production"] = "local"

    WEBHOOK_URL: str = (
        "https://my-domain.com" if ENVIRONMENT != "local" else "http://localhost:3000"
    )
    # Note the leading dot for subdomain support
    COOKIE_DOMAIN: str | None = ".my-domain.com" if ENVIRONMENT == "production" else None

    SECRET_KEY: str
    JWT_ALGORITHM: str

    # Timezone configuration
    TIMEZONE: str = "America/Santiago"

    # Database configuration
    SQLITE_FILE_NAME: str

    @computed_field  # type: ignore[prop-decorator]
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:  # noqa
        return f"sqlite:///{self.SQLITE_FILE_NAME}"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def APP_TIMEZONE(self) -> ZoneInfo:  # noqa
        """Get the timezone object for the configured timezone string."""
        return ZoneInfo(self.TIMEZONE)

settings = Settings()  # type: ignore
