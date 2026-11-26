from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api import deps
from app.models import Propriedade, Usuario, UsuarioPropriedade
from app.schemas import PropriedadeCriacao, PropriedadeAtualizacao, PropriedadeResposta

router = APIRouter()

@router.post("/", response_model=PropriedadeResposta, status_code=status.HTTP_201_CREATED)
def criar_propriedade(
    prop_in: PropriedadeCriacao,
    db: Session = Depends(deps.get_db),
    usuario_atual: Usuario = Depends(deps.get_current_user)
):
    pode_gerenciar = bool(
        usuario_atual.eh_administrador
        or getattr(usuario_atual, "pode_gerenciar_propriedades", False)
        or usuario_atual.administrador_id is None
    )
    if not pode_gerenciar:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Você não tem permissão para cadastrar novas propriedades rurais."
        )

    db_prop = Propriedade(
        usuario_id=usuario_atual.administrador_id if usuario_atual.administrador_id else usuario_atual.id,
        nome=prop_in.nome,
        descricao=prop_in.descricao,
        poligono_geojson=prop_in.poligono_geojson
    )
    db.add(db_prop)
    db.commit()
    db.refresh(db_prop)

    # Se um colaborador autorizado criou a propriedade, vincula-o automaticamente a ela
    if usuario_atual.administrador_id is not None:
        db.add(UsuarioPropriedade(usuario_id=usuario_atual.id, propriedade_id=db_prop.id))
        db.commit()

    return db_prop

@router.get("/", response_model=List[PropriedadeResposta])
def listar_propriedades(
    db: Session = Depends(deps.get_db),
    usuario_atual: Usuario = Depends(deps.get_current_user)
):
    """
    Retorna estritamente as propriedades rurais pertencentes ao usuário ou às quais ele tem vínculo explícito.
    Garante o isolamento absoluto entre diferentes contas (Multi-tenancy).
    """
    # 1. Fazendas pertencentes diretamente ao usuário ou ao admin da conta dele (caso seja admin delegado)
    owner_ids = [usuario_atual.id]
    if usuario_atual.eh_administrador and usuario_atual.administrador_id:
        owner_ids.append(usuario_atual.administrador_id)

    # 2. Fazendas vinculadas via permissões de equipe
    ids_vinculados = [
        up.propriedade_id for up in db.query(UsuarioPropriedade).filter(UsuarioPropriedade.usuario_id == usuario_atual.id).all()
    ]

    return db.query(Propriedade).filter(
        (Propriedade.usuario_id.in_(owner_ids)) | (Propriedade.id.in_(ids_vinculados))
    ).all()

@router.get("/{propriedade_id}", response_model=PropriedadeResposta)
def obter_propriedade(
    propriedade_id: int,
    db: Session = Depends(deps.get_db),
    usuario_atual: Usuario = Depends(deps.get_current_user)
):
    return deps.verificar_acesso_propriedade(db, usuario_atual, propriedade_id)

@router.put("/{propriedade_id}", response_model=PropriedadeResposta)
def atualizar_propriedade(
    propriedade_id: int,
    prop_in: PropriedadeAtualizacao,
    db: Session = Depends(deps.get_db),
    usuario_atual: Usuario = Depends(deps.get_current_user)
):
    prop = deps.verificar_acesso_propriedade(db, usuario_atual, propriedade_id)
    if not (usuario_atual.eh_administrador or getattr(usuario_atual, "pode_gerenciar_propriedades", False)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Você não tem permissão para alterar dados da propriedade."
        )

    if prop_in.nome is not None:
        prop.nome = prop_in.nome
    if prop_in.descricao is not None:
        prop.descricao = prop_in.descricao
    if prop_in.poligono_geojson is not None:
        prop.poligono_geojson = prop_in.poligono_geojson

    db.commit()
    db.refresh(prop)
    return prop

@router.delete("/{propriedade_id}", status_code=status.HTTP_204_NO_CONTENT)
def deletar_propriedade(
    propriedade_id: int,
    db: Session = Depends(deps.get_db),
    usuario_atual: Usuario = Depends(deps.get_current_user)
):
    prop = deps.verificar_acesso_propriedade(db, usuario_atual, propriedade_id)
    if not (usuario_atual.eh_administrador or getattr(usuario_atual, "pode_gerenciar_propriedades", False)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Você não tem permissão para excluir propriedades."
        )

    db.delete(prop)
    db.commit()
    return None
