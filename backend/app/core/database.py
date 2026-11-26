from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from pymongo import MongoClient
from app.core.config import settings

# SQLAlchemy setup (PostgreSQL)
engine = create_engine(
    settings.SQLALCHEMY_DATABASE_URI,
    pool_pre_ping=True
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# PyMongo setup (MongoDB para IoT Telemetry)
mongo_client = MongoClient(settings.MONGO_URI)
mongo_db = mongo_client[settings.MONGO_DB_NAME]

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_mongo_db():
    return mongo_db

def garantir_indices_mongodb():
    """
    Garante a criação de índices compostos (dispositivo_id, data_hora) nas coleções
    de telemetria para manter consultas de histórico e visão geral em tempo constante.
    """
    colecoes = ("telemetria_animais", "telemetria_equipamentos", "telemetria_estacoes")
    for nome_col in colecoes:
        col = mongo_db[nome_col]
        col.create_index([("dispositivo_id", 1), ("data_hora", -1)])
        col.create_index([("data_hora", -1)])


