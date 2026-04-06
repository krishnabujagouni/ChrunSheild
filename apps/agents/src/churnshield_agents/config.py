"""Environment-backed settings."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(
            ".env",
            "agents.env",
            "src/churnshield_agents/agents/.env",
        ),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = Field(default="", description="Supabase/Postgres URL (asyncpg)")
    stripe_secret_key: str = Field(default="", description="Stripe secret key (sk_...)")
    stripe_webhook_secret: str = Field(default="", description="Stripe webhook signing secret")
    environment: str = Field(default="development")
    anthropic_api_key: str = Field(default="", description="Anthropic API key for LangGraph agents")
    resend_api_key: str = Field(default="", description="Resend API key for transactional email")
    resend_from_email: str = Field(default="noreply@churnshield.ai", description="From address for recovery emails")
    voyage_api_key: str = Field(default="", description="Voyage AI API key for voyage-3-lite embeddings")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
