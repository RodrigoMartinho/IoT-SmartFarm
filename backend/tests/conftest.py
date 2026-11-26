import os
import sys
import pytest
from unittest.mock import patch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

# Garante que o diretório backend esteja no PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.database import Base, get_db
from app.models import Usuario, Propriedade, Animal, Alerta
from app.core.security import get_password_hash, create_access_token

# Banco de dados SQLite isolado em memória para testes
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    """Cria uma sessão de banco limpa em memória para cada função de teste."""
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    """Cliente de teste do FastAPI com banco em memória e listener MQTT mockado."""
    from app.main import app

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    from app.core.database import get_db as core_get_db
    from app.api.deps import get_db as deps_get_db

    app.dependency_overrides[core_get_db] = override_get_db
    app.dependency_overrides[deps_get_db] = override_get_db

    # Evita inicializar conexão MQTT e PostgreSQL reais durante a inicialização do app nos testes
    with patch("app.main.start_mqtt_listener"), patch("app.main.engine", engine):
        with TestClient(app) as test_client:
            yield test_client

    app.dependency_overrides.clear()


@pytest.fixture
def usuario_admin(db_session):
    """Cria um usuário administrador para os testes."""
    usuario = Usuario(
        nome="Administrador de Teste",
        email="admin.teste@smartfarm.com",
        senha_hash=get_password_hash("Senha123!"),
        eh_administrador=True,
        pode_acessar_animais=True,
        pode_acessar_equipamentos=True,
        pode_acessar_estacoes=True,
        pode_gerenciar_alarmes=True
    )
    db_session.add(usuario)
    db_session.commit()
    db_session.refresh(usuario)
    return usuario


@pytest.fixture
def token_admin(usuario_admin):
    """Gera token JWT válido para o usuário administrador."""
    return create_access_token(subject=str(usuario_admin.id))


@pytest.fixture
def headers_admin(token_admin):
    """Gera cabeçalho HTTP de autorização Bearer."""
    return {"Authorization": f"Bearer {token_admin}"}


@pytest.fixture
def poligono_fazenda():
    """Polígono GeoJSON de teste (região da Fazenda Modelo Catanduva)."""
    return {
        "type": "Polygon",
        "coordinates": [
            [
                [-21.135000, -48.975000],
                [-21.135000, -48.965000],
                [-21.140000, -48.965000],
                [-21.140000, -48.975000],
                [-21.135000, -48.975000]
            ]
        ]
    }
