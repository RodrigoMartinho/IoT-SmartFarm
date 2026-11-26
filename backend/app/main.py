from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import engine, Base, garantir_indices_mongodb
from app.api.v1.router import api_router
from app.services.mqtt_subscriber import start_mqtt_listener

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    description="API da Plataforma IoT SmartFarm"
)

# Configuração de CORS permissiva para requisições do Frontend Node/React em localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "*"
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)

@app.on_event("startup")
def startup_event():
    import time
    print("[INFO] Inicializando aplicacao FastAPI...", flush=True)

    # Aguarda o PostgreSQL estar pronto e cria as tabelas
    for tentativa in range(1, 11):
        try:
            Base.metadata.create_all(bind=engine)
            from sqlalchemy import inspect, text
            inspector = inspect(engine)
            if "usuarios" in inspector.get_table_names():
                colunas = [c["name"] for c in inspector.get_columns("usuarios")]
                if "pode_gerenciar_propriedades" not in colunas:
                    with engine.begin() as conn:
                        conn.execute(text("ALTER TABLE usuarios ADD COLUMN pode_gerenciar_propriedades BOOLEAN NOT NULL DEFAULT FALSE"))
                        conn.execute(text("UPDATE usuarios SET pode_gerenciar_propriedades = TRUE WHERE eh_administrador = TRUE"))
                    print("[INFO] Coluna 'pode_gerenciar_propriedades' adicionada na tabela 'usuarios'.", flush=True)

            # Torna latitude/longitude opcionais (NULL) em estacoes_ambientais (agora obtidas via GPS do módulo)
            if "estacoes_ambientais" in inspector.get_table_names():
                try:
                    with engine.begin() as conn:
                        conn.execute(text("ALTER TABLE estacoes_ambientais ALTER COLUMN latitude DROP NOT NULL"))
                        conn.execute(text("ALTER TABLE estacoes_ambientais ALTER COLUMN longitude DROP NOT NULL"))
                except Exception:
                    pass

            # Garante novas colunas em animais e equipamentos em bancos já existentes
            if "animais" in inspector.get_table_names():
                colunas_animais = [c["name"] for c in inspector.get_columns("animais")]
                with engine.begin() as conn:
                    if "intervalo_gps_segundos" not in colunas_animais:
                        conn.execute(text("ALTER TABLE animais ADD COLUMN intervalo_gps_segundos INTEGER NOT NULL DEFAULT 10"))
                        print("[INFO] Coluna 'intervalo_gps_segundos' adicionada na tabela 'animais'.", flush=True)
                    if "intervalo_envio_segundos" not in colunas_animais:
                        conn.execute(text("ALTER TABLE animais ADD COLUMN intervalo_envio_segundos INTEGER NOT NULL DEFAULT 5"))
                        print("[INFO] Coluna 'intervalo_envio_segundos' adicionada na tabela 'animais'.", flush=True)
                    if "economia_energia" not in colunas_animais:
                        conn.execute(text("ALTER TABLE animais ADD COLUMN economia_energia BOOLEAN NOT NULL DEFAULT TRUE"))
                        print("[INFO] Coluna 'economia_energia' adicionada na tabela 'animais'.", flush=True)

            if "equipamentos" in inspector.get_table_names():
                colunas_equip = [c["name"] for c in inspector.get_columns("equipamentos")]
                if "intervalo_envio_segundos" not in colunas_equip:
                    with engine.begin() as conn:
                        conn.execute(text("ALTER TABLE equipamentos ADD COLUMN intervalo_envio_segundos INTEGER NOT NULL DEFAULT 20"))
                    print("[INFO] Coluna 'intervalo_envio_segundos' adicionada na tabela 'equipamentos'.", flush=True)

            # Converte antigos índices UNIQUE globais em índices normais (unicidade agora é por conta)
            for tabela in ("animais", "equipamentos", "estacoes_ambientais"):
                if tabela in inspector.get_table_names():
                    for idx in inspector.get_indexes(tabela):
                        if idx.get("unique") and idx.get("name"):
                            nome_idx = idx["name"]
                            cols = idx.get("column_names", [])
                            with engine.begin() as conn:
                                conn.execute(text(f"DROP INDEX IF EXISTS {nome_idx}"))
                                if cols:
                                    conn.execute(text(f"CREATE INDEX IF NOT EXISTS {nome_idx} ON {tabela} ({', '.join(cols)})"))
                            print(f"[INFO] Índice '{nome_idx}' em '{tabela}' convertido para escopo por conta.", flush=True)

            print("[INFO] Tabelas PostgreSQL inicializadas com sucesso.", flush=True)
            break
        except Exception as e:
            print(f"[WARN] Aguardando PostgreSQL ({tentativa}/10)... Erro: {e}", flush=True)
            time.sleep(3)

    # Garante índices de telemetria no MongoDB sem bloquear o startup
    import threading
    def _init_mongo_indexes():
        try:
            garantir_indices_mongodb()
            print("[INFO] Índices do MongoDB verificados com sucesso.", flush=True)
        except Exception as e:
            print(f"[WARN] Não foi possível criar índices no MongoDB no startup: {e}", flush=True)
    threading.Thread(target=_init_mongo_indexes, daemon=True).start()

    # Inicia listener MQTT em background thread
    start_mqtt_listener()

@app.get("/")
def root():
    return {
        "message": "Bem-vindo à API da Plataforma IoT SmartFarm",
        "docs": "/docs",
        "version": "1.0.0"
    }
