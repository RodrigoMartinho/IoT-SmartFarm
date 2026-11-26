from fastapi import APIRouter
from app.api.v1 import auth, properties, animals, equipments, environments, telemetry, alarms, users

api_router = APIRouter()

# --- ROTAS PRINCIPAIS EM PORTUGUÊS (EXIBIDAS NO SWAGGER) ---
api_router.include_router(auth.router, prefix="/autenticacao", tags=["Autenticação"])
api_router.include_router(users.router, prefix="/usuarios", tags=["Usuários e Equipe"])
api_router.include_router(properties.router, prefix="/propriedades", tags=["Propriedades"])
api_router.include_router(animals.router, prefix="/animais", tags=["Animais"])
api_router.include_router(equipments.router, prefix="/equipamentos", tags=["Equipamentos"])
api_router.include_router(environments.router, prefix="/estacoes-ambientais", tags=["Estações Ambientais"])
api_router.include_router(environments.router, prefix="/estacoesambientais", tags=["Estações Ambientais"], include_in_schema=False)
api_router.include_router(telemetry.router, prefix="/telemetria", tags=["Telemetria"])
api_router.include_router(alarms.router, prefix="/alertas", tags=["Alertas"])

# --- ROTAS DE COMPATIBILIDADE (OCULTAS DO SWAGGER) ---
api_router.include_router(auth.router, prefix="/auth", include_in_schema=False)
api_router.include_router(users.router, prefix="/users", include_in_schema=False)
api_router.include_router(properties.router, prefix="/properties", include_in_schema=False)
api_router.include_router(animals.router, prefix="/animals", include_in_schema=False)
api_router.include_router(equipments.router, prefix="/equipments", include_in_schema=False)
api_router.include_router(environments.router, prefix="/environments", include_in_schema=False)
api_router.include_router(telemetry.router, prefix="/telemetry", include_in_schema=False)
api_router.include_router(alarms.router, prefix="/alarms", include_in_schema=False)
