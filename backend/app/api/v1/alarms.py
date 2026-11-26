import re
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api import deps
from app.models import Alerta, Propriedade, Usuario
from app.schemas import AlertaResposta

router = APIRouter()


def _limpar_prefixo_coleira_mensagem(msg: Optional[str]) -> Optional[str]:
    if not msg:
        return msg
    return re.sub(r"\((?:coleira|brinco)\s*#([^)]+)\)", r"(\1)", msg, flags=re.IGNORECASE)


@router.get("/propriedade/{propriedade_id}", response_model=List[AlertaResposta])
@router.get("/property/{propriedade_id}", response_model=List[AlertaResposta], include_in_schema=False)
def listar_alertas_por_propriedade(
    propriedade_id: int,
    apenas_ativos: Optional[bool] = None,
    active_only: Optional[bool] = None,
    db: Session = Depends(deps.get_db),
    usuario_atual: Usuario = Depends(deps.get_current_user)
):
    deps.verificar_acesso_propriedade(db, usuario_atual, propriedade_id)

    filtrar_ativos = True
    if apenas_ativos is not None:
        filtrar_ativos = apenas_ativos
    elif active_only is not None:
        filtrar_ativos = active_only

    query = db.query(Alerta).filter(Alerta.propriedade_id == propriedade_id)
    if filtrar_ativos:
        query = query.filter(Alerta.esta_ativo == True)

    alertas = query.order_by(Alerta.criado_em.desc()).all()
    for a in alertas:
        a.mensagem = _limpar_prefixo_coleira_mensagem(a.mensagem)
    return alertas

@router.put("/{alerta_id}/reconhecer", response_model=AlertaResposta)
@router.put("/{alerta_id}/dismiss", response_model=AlertaResposta, include_in_schema=False)
def dispensar_alerta(
    alerta_id: int,
    db: Session = Depends(deps.get_db),
    usuario_atual: Usuario = Depends(deps.get_current_user)
):
    if not usuario_atual.pode_gerenciar_alarmes:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado: seu usuário não possui permissão para gerenciar ou desativar alarmes."
        )

    alerta = db.query(Alerta).filter(Alerta.id == alerta_id).first()
    if not alerta:
        raise HTTPException(status_code=404, detail="Alerta não encontrado.")

    deps.verificar_acesso_propriedade(db, usuario_atual, alerta.propriedade_id)
    
    alerta.esta_ativo = False
    db.commit()
    db.refresh(alerta)
    return alerta
