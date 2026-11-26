import base64

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:////data/blixtbo.db"
    app_secret: str = "dev-only-change-me"
    worker_kek: str = ""
    # Public half seals passwords before they touch the queue. Not a secret.
    worker_seal_public: str = ""
    # Private half. Only the worker may set this. The API leaves it empty.
    worker_seal_private: str = ""
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
    data_backend: str = "postgres"
    firebase_project_id: str = ""
    firebase_service_account: str = ""
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_id: str = ""
    premium_price_kr: float = 99
    trial_days: int = 3
    free_auto_apply_limit: int = 2
    public_app_url: str = "http://127.0.0.1:43123"
    apple_bundle_id: str = "se.blixtbo.app"
    apple_product_id: str = "se.blixtbo.premium.monthly"
    # 0 skips the check. Production should set the numeric App Store app id.
    apple_app_apple_id: int = 0
    apple_root_cert_path: str = ""
    apns_key_id: str = ""
    apns_team_id: str = ""
    # PEM contents, or a path to the AuthKey .p8. Empty means push is stored but not sent.
    apns_key_p8: str = ""
    apns_use_sandbox: bool = True

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
