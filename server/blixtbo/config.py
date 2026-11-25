import base64

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:////data/blixtbo.db"
    app_secret: str = "dev-only-change-me"
    worker_kek: str = ""
    owner_google_email: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = ""
    public_url: str = "http://127.0.0.1:8080"
    admin_path: str = "/internal/ops"
    hf_model: str = "intfloat/multilingual-e5-small"
    hf_token: str = ""
    match_backend: str = "hf-inference"
    landlord_mode: str = "dry-run"

    def kek_bytes(self) -> bytes:
        if not self.worker_kek:
            raise RuntimeError("WORKER_KEK is not set. This process cannot read landlord logins.")
        raw = base64.b64decode(self.worker_kek)
        if len(raw) != 32:
            raise RuntimeError("WORKER_KEK must be 32 bytes, base64-encoded.")
        return raw


def load_settings() -> Settings:
    return Settings()


settings = load_settings()
