from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api import deps
from app.core.database import mongo_db
from app.models import EstacaoAmbiental, Propriedade, Usuario
from app.schemas import EstacaoAmbientalCriacao, EstacaoAmbientalAtualizacao, EstacaoAmbientalResposta

router = APIRouter()

@router.post("/", response_model=EstacaoAmbientalResposta, status_code=status.HTTP_201_CREATED)
def criar_estacao_ambiental(
    st_in: EstacaoAmbientalCriacao,
    db: Session = Depends(deps.get_db),
    usuario_atual: Usuario = Depends(deps.get_current_user)
):
    if not usuario_atual.pode_acessar_estacoes:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado: seu usuário não possui permissão para acessar o módulo de Estações Ambientais.")

    prop = deps.verificar_acesso_propriedade(db, usuario_atual, st_in.propriedade_id)
    props_conta_ids = deps.obter_propriedades_conta_ids(db, prop.usuario_id)

    dispositivo_existente = db.query(EstacaoAmbiental).filter(
        EstacaoAmbiental.dispositivo_id == st_in.dispositivo_id,
        EstacaoAmbiental.propriedade_id.in_(props_conta_ids)
    ).first()
    if dispositivo_existente:
        raise HTTPException(status_code=400, detail="Dispositivo IoT já cadastrado para outra estação na sua conta.")

    db_st = EstacaoAmbiental(**st_in.model_dump())
    db.add(db_st)
    db.commit()
    db.refresh(db_st)
    return db_st

@router.get("/propriedade/{propriedade_id}", response_model=List[EstacaoAmbientalResposta])
@router.get("/property/{propriedade_id}", response_model=List[EstacaoAmbientalResposta], include_in_schema=False)
def listar_estacoes_por_propriedade(
    propriedade_id: int,
    db: Session = Depends(deps.get_db),
    usuario_atual: Usuario = Depends(deps.get_current_user)
):
    if not usuario_atual.pode_acessar_estacoes:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado: seu usuário não possui permissão para acessar o módulo de Estações Ambientais.")

    deps.verificar_acesso_propriedade(db, usuario_atual, propriedade_id)
    estacoes = db.query(EstacaoAmbiental).filter(EstacaoAmbiental.propriedade_id == propriedade_id).all()
    for st in estacoes:
        try:
            filtro_base = {
                "dispositivo_id": st.dispositivo_id,
                "$or": [{"propriedade_id": propriedade_id}, {"propriedade_id": {"$exists": False}}],
            }
            doc = mongo_db["telemetria_estacoes"].find_one(
                filtro_base,
                sort=[("data_hora", -1)]
            )
            if doc:
                if "_id" in doc:
                    doc["_id"] = str(doc["_id"])
                lat_doc = doc.get("latitude")
                lng_doc = doc.get("longitude")
                if lat_doc is None or lng_doc is None or (float(lat_doc) == 0.0 and float(lng_doc) == 0.0):
                    doc_gps = mongo_db["telemetria_estacoes"].find_one(
                        {
                            **filtro_base,
                            "latitude": {"$nin": [None, 0, 0.0, ""], "$exists": True},
                            "longitude": {"$nin": [None, 0, 0.0, ""], "$exists": True},
                        },
                        sort=[("data_hora", -1)],
                    )
                    if doc_gps and doc_gps.get("latitude") is not None and doc_gps.get("longitude") is not None:
                        doc["latitude"] = float(doc_gps["latitude"])
                        doc["longitude"] = float(doc_gps["longitude"])
                if doc.get("latitude") is not None and doc.get("longitude") is not None:
                    st.latitude = float(doc["latitude"])
                    st.longitude = float(doc["longitude"])
                setattr(st, "ultima_telemetria", doc)
        except Exception:
            pass
    return estacoes

@router.put("/{estacao_id}", response_model=EstacaoAmbientalResposta)
def atualizar_estacao_ambiental(
    estacao_id: int,
    st_in: EstacaoAmbientalAtualizacao,
    db: Session = Depends(deps.get_db),
    usuario_atual: Usuario = Depends(deps.get_current_user)
):
    if not usuario_atual.pode_acessar_estacoes:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado: seu usuário não possui permissão para acessar o módulo de Estações Ambientais.")

    st = db.query(EstacaoAmbiental).filter(EstacaoAmbiental.id == estacao_id).first()
    if not st:
        raise HTTPException(status_code=404, detail="Estação ambiental não encontrada.")

    prop = deps.verificar_acesso_propriedade(db, usuario_atual, st.propriedade_id)
    props_conta_ids = deps.obter_propriedades_conta_ids(db, prop.usuario_id)

    if st_in.dispositivo_id and st_in.dispositivo_id != st.dispositivo_id:
        dispositivo_existente = db.query(EstacaoAmbiental).filter(
            EstacaoAmbiental.dispositivo_id == st_in.dispositivo_id,
            EstacaoAmbiental.propriedade_id.in_(props_conta_ids),
            EstacaoAmbiental.id != estacao_id
        ).first()
        if dispositivo_existente:
            raise HTTPException(status_code=400, detail="Dispositivo IoT já cadastrado para outra estação na sua conta.")

    dados_atualizacao = st_in.model_dump(exclude_unset=True)
    for campo, valor in dados_atualizacao.items():
        setattr(st, campo, valor)

    db.commit()
    db.refresh(st)
    return st

@router.delete("/{estacao_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover_estacao_ambiental(
    estacao_id: int,
    db: Session = Depends(deps.get_db),
    usuario_atual: Usuario = Depends(deps.get_current_user)
):
    if not usuario_atual.pode_acessar_estacoes:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado: seu usuário não possui permissão para acessar o módulo de Estações Ambientais.")

    st = db.query(EstacaoAmbiental).filter(EstacaoAmbiental.id == estacao_id).first()
    if not st:
        raise HTTPException(status_code=404, detail="Estação ambiental não encontrada.")

    deps.verificar_acesso_propriedade(db, usuario_atual, st.propriedade_id)

    db.delete(st)
    db.commit()
    return None
