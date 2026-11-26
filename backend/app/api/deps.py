from typing import Generator, List, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import SessionLocal
from app.models import User, UsuarioPropriedade, Propriedade, Animal, Equipamento, EstacaoAmbiental
from app.schemas import TokenPayload

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/autenticacao/login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/autenticacao/login", auto_error=False)

def get_db() -> Generator:
    try:
        db = SessionLocal()
        yield db
    finally:
        db.close()

def get_current_user(
    db: Session = Depends(get_db),
    token: str = Depends(oauth2_scheme)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Não foi possível me autenticar. Credenciais inválidas.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        token_data = TokenPayload(sub=user_id)
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.id == int(token_data.sub)).first()
    if user is None:
        raise credentials_exception
    return user


def get_optional_current_user(
    db: Session = Depends(get_db),
    token: Optional[str] = Depends(oauth2_scheme_optional)
) -> Optional[User]:
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            return None
        return db.query(User).filter(User.id == int(user_id)).first()
    except (JWTError, ValueError):
        return None


def obter_propriedades_autorizadas_ids(db: Session, usuario: User) -> List[int]:
    """
    Retorna a lista de IDs das propriedades às quais o usuário possui acesso autorizado.
    """
    owner_ids = [usuario.id]
    if usuario.eh_administrador and usuario.administrador_id:
        owner_ids.append(usuario.administrador_id)

    ids_vinculados = [
        up.propriedade_id for up in db.query(UsuarioPropriedade).filter(UsuarioPropriedade.usuario_id == usuario.id).all()
    ]
    props = db.query(Propriedade.id).filter(
        (Propriedade.usuario_id.in_(owner_ids)) | (Propriedade.id.in_(ids_vinculados))
    ).all()
    return [p[0] for p in props]



def verificar_acesso_propriedade(db: Session, usuario: User, propriedade_id: int) -> Propriedade:
    """
    Verifica se o usuário tem permissão para acessar a propriedade informada.
    """
    prop = db.query(Propriedade).filter(Propriedade.id == propriedade_id).first()
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Propriedade não encontrada.")

    # Se for o dono direto da propriedade
    if prop.usuario_id == usuario.id:
        return prop

    # Se for membro vinculado
    vinculo = db.query(UsuarioPropriedade).filter(
        UsuarioPropriedade.propriedade_id == propriedade_id,
        UsuarioPropriedade.usuario_id == usuario.id
    ).first()
    if vinculo:
        return prop

    # Se for administrador delegado da conta do dono da fazenda
    if usuario.eh_administrador and usuario.administrador_id and prop.usuario_id == usuario.administrador_id:
        return prop

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Acesso negado: seu usuário não possui permissão para acessar esta propriedade rural."
    )


def obter_propriedades_conta_ids(db: Session, conta_usuario_id: int) -> List[int]:
    """
    Retorna todos os IDs de propriedades pertencentes ao titular da conta informada.
    """
    props = db.query(Propriedade.id).filter(Propriedade.usuario_id == conta_usuario_id).all()
    return [p[0] for p in props]


def verificar_acesso_dispositivo(db: Session, usuario: User, dispositivo_id: str):
    """
    Resolve o dispositivo IoT (animal, equipamento ou estação) dentro das propriedades
    autorizadas do usuário e garante que ele tem acesso ao módulo correspondente.

    Retorna 404 tanto para dispositivo inexistente quanto para dispositivo de outra conta,
    evitando que um usuário descubra quais IDs existem em fazendas de terceiros e permitindo
    que contas diferentes utilizem o mesmo identificador amigável (ex: 'Animal1').
    """
    modulos = (
        (Animal, "pode_acessar_animais"),
        (Equipamento, "pode_acessar_equipamentos"),
        (EstacaoAmbiental, "pode_acessar_estacoes"),
    )
    nao_encontrado = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dispositivo não encontrado.")
    props_ids = obter_propriedades_autorizadas_ids(db, usuario)
    if not props_ids:
        raise nao_encontrado

    dev_str = str(dispositivo_id).strip()
    for modelo, permissao in modulos:
        item = db.query(modelo).filter(
            func.lower(func.trim(modelo.dispositivo_id)) == dev_str.lower(),
            modelo.propriedade_id.in_(props_ids)
        ).first()
        if item is None:
            continue

        if not getattr(usuario, permissao):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acesso negado: seu usuário não possui permissão para acessar este tipo de dispositivo."
            )
        return item

    raise nao_encontrado



