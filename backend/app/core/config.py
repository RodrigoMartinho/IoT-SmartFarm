import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Plataforma IoT SmartFarm"
    API_V1_STR: str = "/api/v1"
    
    # JWT Auth (configure via .env em execucao real)
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-key-configure-via-env")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day

    # PostgreSQL
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "CONFIGURE_SENHA_POSTGRES")
    POSTGRES_SERVER: str = os.getenv("POSTGRES_SERVER", "localhost")
    POSTGRES_PORT: str = os.getenv("POSTGRES_PORT", "5432")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "iot_farm_db")

    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        return f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    # MongoDB (NoSQL para Telemetria IoT)
    MONGO_URI: str = os.getenv("MONGO_URI", "mongodb://usuario:senha@localhost:27017")
    MONGO_DB_NAME: str = os.getenv("MONGO_DB_NAME", "iot_telemetry_db")

    # MQTT Broker
    MQTT_BROKER_HOST: str = os.getenv("MQTT_BROKER_HOST", "localhost")
    MQTT_BROKER_PORT: int = int(os.getenv("MQTT_BROKER_PORT", "1883"))
    MQTT_BROKER_USER: str = os.getenv("MQTT_BROKER_USER", "CONFIGURE_USUARIO_MQTT")
    MQTT_BROKER_PASSWORD: str = os.getenv("MQTT_BROKER_PASSWORD", "CONFIGURE_SENHA_MQTT")

    # Seguranca e Anti-bot de Registro (opcional)
    REGISTRATION_INVITE_CODE: str = os.getenv("REGISTRATION_INVITE_CODE", "")

    class Config:
        case_sensitive = True

settings = Settings()
