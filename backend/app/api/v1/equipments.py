from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api import deps
from app.models import Equipamento, Propriedade, Usuario
from app.schemas import EquipamentoCriacao, EquipamentoAtualizacao, EquipamentoResposta
from app.services.mqtt_publisher import publicar_configuracao_equipamento

router = APIRouter()

@router.post("/", response_model=EquipamentoResposta, status_code=status.HTTP_201_CREATED)
def criar_equipamento(
    eq_in: EquipamentoCriacao,
    db: Session = Depends(deps.get_db),
    usuario_atual: Usuario = Depends(deps.get_current_user)
):
    if not usuario_atual.pode_acessar_equipamentos:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado: seu usuário não possui permissão para acessar o módulo de Equipamentos.")

    prop = deps.verificar_acesso_propriedade(db, usuario_atual, eq_in.propriedade_id)
    props_conta_ids = deps.obter_propriedades_conta_ids(db, prop.usuario_id)

    dispositivo_existente = db.query(Equipamento).filter(
        Equipamento.dispositivo_id == eq_in.dispositivo_id,
        Equipamento.propriedade_id.in_(props_conta_ids)
    ).first()
    if dispositivo_existente:
        raise HTTPException(status_code=400, detail="Dispositivo IoT já cadastrado para outro equipamento na sua conta.")

    db_eq = Equipamento(**eq_in.model_dump())
    db.add(db_eq)
    db.commit()
    db.refresh(db_eq)

    publicar_configuracao_equipamento(
        dispositivo_id=db_eq.dispositivo_id,
        intervalo_envio_segundos=db_eq.intervalo_envio_segundos or 20
    )

    return db_eq

@router.get("/propriedade/{propriedade_id}", response_model=List[EquipamentoResposta])
@router.get("/property/{propriedade_id}", response_model=List[EquipamentoResposta], include_in_schema=False)
def listar_equipamentos_por_propriedade(
    propriedade_id: int,
    db: Session = Depends(deps.get_db),
    usuario_atual: Usuario = Depends(deps.get_current_user)
):
    if not usuario_atual.pode_acessar_equipamentos:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado: seu usuário não possui permissão para acessar o módulo de Equipamentos.")

    deps.verificar_acesso_propriedade(db, usuario_atual, propriedade_id)
    return db.query(Equipamento).filter(Equipamento.propriedade_id == propriedade_id).all()

@router.put("/{equipamento_id}", response_model=EquipamentoResposta)
def atualizar_equipamento(
    equipamento_id: int,
    eq_in: EquipamentoAtualizacao,
    db: Session = Depends(deps.get_db),
    usuario_atual: Usuario = Depends(deps.get_current_user)
):
    if not usuario_atual.pode_acessar_equipamentos:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado: seu usuário não possui permissão para acessar o módulo de Equipamentos.")

    eq = db.query(Equipamento).filter(Equipamento.id == equipamento_id).first()
    if not eq:
        raise HTTPException(status_code=404, detail="Equipamento não encontrado.")

    prop = deps.verificar_acesso_propriedade(db, usuario_atual, eq.propriedade_id)
    props_conta_ids = deps.obter_propriedades_conta_ids(db, prop.usuario_id)

    if eq_in.dispositivo_id and eq_in.dispositivo_id != eq.dispositivo_id:
        dispositivo_existente = db.query(Equipamento).filter(
            Equipamento.dispositivo_id == eq_in.dispositivo_id,
            Equipamento.propriedade_id.in_(props_conta_ids),
            Equipamento.id != equipamento_id
        ).first()
        if dispositivo_existente:
            raise HTTPException(status_code=400, detail="Dispositivo IoT já cadastrado para outro equipamento na sua conta.")

    dados_atualizacao = eq_in.model_dump(exclude_unset=True)
    for campo, valor in dados_atualizacao.items():
        setattr(eq, campo, valor)

    db.commit()
    db.refresh(eq)

    publicar_configuracao_equipamento(
        dispositivo_id=eq.dispositivo_id,
        intervalo_envio_segundos=eq.intervalo_envio_segundos or 20
    )

    return eq

@router.patch("/{equipamento_id}/intervalo", response_model=EquipamentoResposta)
def alterar_intervalo_equipamento(
    equipamento_id: int,
    intervalo_envio_segundos: int,
    db: Session = Depends(deps.get_db),
    usuario_atual: Usuario = Depends(deps.get_current_user)
):
    if not usuario_atual.pode_acessar_equipamentos:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado: seu usuário não possui permissão para acessar o módulo de Equipamentos.")

    eq = db.query(Equipamento).filter(Equipamento.id == equipamento_id).first()
    if not eq:
        raise HTTPException(status_code=404, detail="Equipamento não encontrado.")

    deps.verificar_acesso_propriedade(db, usuario_atual, eq.propriedade_id)

    if intervalo_envio_segundos < 5:
        raise HTTPException(status_code=400, detail="O intervalo mínimo de envio é de 5 segundos.")

    eq.intervalo_envio_segundos = intervalo_envio_segundos
    db.commit()
    db.refresh(eq)

    publicar_configuracao_equipamento(
        dispositivo_id=eq.dispositivo_id,
        intervalo_envio_segundos=eq.intervalo_envio_segundos
    )
    return eq

@router.delete("/{equipamento_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover_equipamento(
    equipamento_id: int,
    db: Session = Depends(deps.get_db),
    usuario_atual: Usuario = Depends(deps.get_current_user)
):
    if not usuario_atual.pode_acessar_equipamentos:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado: seu usuário não possui permissão para acessar o módulo de Equipamentos.")

    eq = db.query(Equipamento).filter(Equipamento.id == equipamento_id).first()
    if not eq:
        raise HTTPException(status_code=404, detail="Equipamento não encontrado.")

    deps.verificar_acesso_propriedade(db, usuario_atual, eq.propriedade_id)

    db.delete(eq)
    db.commit()
    return None
