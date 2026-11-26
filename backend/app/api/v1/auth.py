import time
from datetime import timedelta
from typing import Dict, List
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.api import deps
from app.core import security
from app.core.config import settings
from app.core.network import obter_ip_cliente
from app.models import Usuario, Propriedade, Animal, Equipamento, EstacaoAmbiental
from app.schemas import UsuarioCriacao, UsuarioResposta, Token

router = APIRouter()

# Armazena tentativas de registro por IP: { ip: [timestamp1, timestamp2] }
REGISTRATION_ATTEMPTS: Dict[str, List[float]] = {}
MAX_REGISTRATIONS_PER_HOUR = 5
RATE_LIMIT_WINDOW_SECONDS = 3600

# Armazena tentativas falhas de login por IP e por e-mail (proteção contra força bruta)
LOGIN_ATTEMPTS_IP: Dict[str, List[float]] = {}
LOGIN_ATTEMPTS_EMAIL: Dict[str, List[float]] = {}
MAX_LOGIN_ATTEMPTS_PER_IP = 10
MAX_LOGIN_ATTEMPTS_PER_EMAIL = 5
LOGIN_RATE_LIMIT_WINDOW_SECONDS = 300  # 5 minutos


def _obter_tentativas_ativas(armazenamento: Dict[str, List[float]], chave: str, janela: int, agora: float) -> List[float]:
    """Limpa registros expirados do dicionário e retorna os timestamps ativos da chave."""
    for k in [item for item, ts in armazenamento.items() if all(agora - t >= janela for t in ts)]:
        del armazenamento[k]
    return [t for t in armazenamento.get(chave, []) if agora - t < janela]


def _registrar_falha_login(client_ip: str, email_key: str, agora: float) -> None:
    """Registra tentativa de login inválida tanto para o IP quanto para o e-mail."""
    tentativas_ip = _obter_tentativas_ativas(LOGIN_ATTEMPTS_IP, client_ip, LOGIN_RATE_LIMIT_WINDOW_SECONDS, agora)
    tentativas_ip.append(agora)
    LOGIN_ATTEMPTS_IP[client_ip] = tentativas_ip

    if email_key:
        tentativas_email = _obter_tentativas_ativas(LOGIN_ATTEMPTS_EMAIL, email_key, LOGIN_RATE_LIMIT_WINDOW_SECONDS, agora)
        tentativas_email.append(agora)
        LOGIN_ATTEMPTS_EMAIL[email_key] = tentativas_email

@router.post("/registro", response_model=UsuarioResposta, status_code=status.HTTP_201_CREATED)
@router.post("/register", response_model=UsuarioResposta, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def registrar_usuario(request: Request, usuario_in: UsuarioCriacao, db: Session = Depends(deps.get_db)):
    # 1. Rate Limiting por IP (Anti-Spam / Anti-DDoS)
    client_ip = obter_ip_cliente(request)
    agora = time.time()

    # Descarta IPs cujas tentativas já expiraram (evita crescimento indefinido do dicionário)
    for ip_registrado in [ip for ip, ts in REGISTRATION_ATTEMPTS.items() if all(agora - t >= RATE_LIMIT_WINDOW_SECONDS for t in ts)]:
        del REGISTRATION_ATTEMPTS[ip_registrado]

    tentativas = [t for t in REGISTRATION_ATTEMPTS.get(client_ip, []) if agora - t < RATE_LIMIT_WINDOW_SECONDS]
    if len(tentativas) >= MAX_REGISTRATIONS_PER_HOUR:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Muitas tentativas de cadastro a partir deste endereço IP. Tente novamente mais tarde."
        )

    # 2. Proteção Honeypot (Anti-Bot invisível)
    if usuario_in.honeypot and usuario_in.honeypot.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Requisição rejeitada por validação de segurança."
        )

    # 3. Código de Convite da Fazenda
    if settings.REGISTRATION_INVITE_CODE:
        codigo_esperado = settings.REGISTRATION_INVITE_CODE.strip().upper()
        codigo_fornecido = (usuario_in.codigo_convite or "").strip().upper()
        if codigo_fornecido != codigo_esperado:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Código de convite da fazenda inválido. Solicite o código ao administrador da propriedade."
            )

    usuario = db.query(Usuario).filter(Usuario.email == usuario_in.email).first()
    if usuario:
        raise HTTPException(
            status_code=400,
            detail="Já existe um usuário cadastrado com este e-mail."
        )
    
    senha_hash = security.get_password_hash(usuario_in.senha)
    db_usuario = Usuario(
        nome=usuario_in.nome,
        email=usuario_in.email,
        senha_hash=senha_hash,
        eh_administrador=True,
        pode_acessar_animais=True,
        pode_acessar_equipamentos=True,
        pode_acessar_estacoes=True,
        pode_gerenciar_alarmes=True,
        pode_gerenciar_propriedades=True
    )
    db.add(db_usuario)
    db.commit()
    db.refresh(db_usuario)

    # Registra a tentativa bem-sucedida para o rate limiting
    tentativas.append(agora)
    REGISTRATION_ATTEMPTS[client_ip] = tentativas

    res = UsuarioResposta.model_validate(db_usuario)
    res.propriedades_ids = []
    return res

@router.post("/login")
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(deps.get_db)):
    client_ip = obter_ip_cliente(request)
    email_key = (form_data.username or "").strip().lower()
    agora = time.time()

    tentativas_ip = _obter_tentativas_ativas(LOGIN_ATTEMPTS_IP, client_ip, LOGIN_RATE_LIMIT_WINDOW_SECONDS, agora)
    tentativas_email = (
        _obter_tentativas_ativas(LOGIN_ATTEMPTS_EMAIL, email_key, LOGIN_RATE_LIMIT_WINDOW_SECONDS, agora)
        if email_key else []
    )

    if len(tentativas_ip) >= MAX_LOGIN_ATTEMPTS_PER_IP or len(tentativas_email) >= MAX_LOGIN_ATTEMPTS_PER_EMAIL:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Muitas tentativas de login inválidas. Aguarde alguns minutos antes de tentar novamente.",
            headers={"Retry-After": str(LOGIN_RATE_LIMIT_WINDOW_SECONDS)},
        )

    usuario = db.query(Usuario).filter(Usuario.email == form_data.username).first()
    if not usuario or not security.verify_password(form_data.password, usuario.senha_hash):
        _registrar_falha_login(client_ip, email_key, agora)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha incorretos.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Limpa o histórico de falhas da conta após autenticação bem-sucedida
    if email_key and email_key in LOGIN_ATTEMPTS_EMAIL:
        del LOGIN_ATTEMPTS_EMAIL[email_key]

    expiracao = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    token = security.create_access_token(
        subject=usuario.id, expires_delta=expiracao
    )
    return {
        "token_acesso": token,
        "tipo_token": "bearer",
        "access_token": token,
        "token_type": "bearer"
    }

@router.get("/eu", response_model=UsuarioResposta)
@router.get("/me", response_model=UsuarioResposta, include_in_schema=False)
def obter_usuario_atual(
    usuario_atual: Usuario = Depends(deps.get_current_user),
    db: Session = Depends(deps.get_db)
):
    if usuario_atual.eh_administrador:
        admin_id = usuario_atual.id if usuario_atual.administrador_id is None else usuario_atual.administrador_id
        props_ids = [p.id for p in db.query(Propriedade).filter(Propriedade.usuario_id == admin_id).all()]
    else:
        props_ids = [up.propriedade_id for up in usuario_atual.propriedades_associadas]

    res = UsuarioResposta.model_validate(usuario_atual)
    res.propriedades_ids = props_ids
    return res
