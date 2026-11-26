from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api import deps
from app.models import Animal, Propriedade, Usuario
from app.schemas import AnimalCriacao, AnimalAtualizacao, AnimalResposta
from app.core.database import mongo_db
from app.services.mqtt_publisher import publicar_configuracao_animal

router = APIRouter()

def _anexar_ultima_telemetria_animal(animal: Animal) -> AnimalResposta:
    res = AnimalResposta.model_validate(animal)
    try:
        filtro_prop = {
            "dispositivo_id": animal.dispositivo_id,
            "$or": [{"propriedade_id": animal.propriedade_id}, {"propriedade_id": {"$exists": False}}]
        }
        doc = (
            mongo_db["telemetria_animais"].find_one(filtro_prop, sort=[("data_hora", -1)])
            or mongo_db["animal_telemetry"].find_one({"device_id": animal.dispositivo_id}, sort=[("timestamp", -1)])
        )
        if doc:
            doc_limpo = dict(doc)
            if "_id" in doc_limpo:
                doc_limpo["_id"] = str(doc_limpo["_id"])
            res.ultima_telemetria = doc_limpo
    except Exception:
        res.ultima_telemetria = None
    return res

@router.post("/", response_model=AnimalResposta, status_code=status.HTTP_201_CREATED)
def criar_animal(
    animal_in: AnimalCriacao,
    db: Session = Depends(deps.get_db),
    usuario_atual: Usuario = Depends(deps.get_current_user)
):
    if not usuario_atual.pode_acessar_animais:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado: seu usuário não possui permissão para acessar o módulo de Animais.")

    # Verificar se a propriedade pertence ou é acessível pelo usuário
    prop = deps.verificar_acesso_propriedade(db, usuario_atual, animal_in.propriedade_id)
    props_conta_ids = deps.obter_propriedades_conta_ids(db, prop.usuario_id)

    # Verificar se dispositivo_id ou numero_brinco já existem dentro da mesma conta
    dispositivo_existente = db.query(Animal).filter(
        Animal.dispositivo_id == animal_in.dispositivo_id,
        Animal.propriedade_id.in_(props_conta_ids)
    ).first()
    if dispositivo_existente:
        raise HTTPException(status_code=400, detail="Dispositivo IoT já cadastrado para outro animal na sua conta.")
        
    brinco_existente = db.query(Animal).filter(
        Animal.numero_brinco == animal_in.numero_brinco,
        Animal.propriedade_id.in_(props_conta_ids)
    ).first()
    if brinco_existente:
        raise HTTPException(status_code=400, detail="Número da coleira já cadastrado na sua conta.")

    db_animal = Animal(**animal_in.model_dump())
    db.add(db_animal)
    db.commit()
    db.refresh(db_animal)

    # Publica a configuração inicial no broker MQTT (retained) para o ESP32
    publicar_configuracao_animal(
        dispositivo_id=db_animal.dispositivo_id,
        intervalo_gps_segundos=db_animal.intervalo_gps_segundos,
        intervalo_envio_segundos=db_animal.intervalo_envio_segundos,
        economia_energia=getattr(db_animal, "economia_energia", True)
    )

    return _anexar_ultima_telemetria_animal(db_animal)

@router.get("/propriedade/{propriedade_id}", response_model=List[AnimalResposta])
@router.get("/property/{propriedade_id}", response_model=List[AnimalResposta], include_in_schema=False)
def listar_animais_por_propriedade(
    propriedade_id: int,
    db: Session = Depends(deps.get_db),
    usuario_atual: Usuario = Depends(deps.get_current_user)
):
    if not usuario_atual.pode_acessar_animais:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado: seu usuário não possui permissão para acessar o módulo de Animais.")

    deps.verificar_acesso_propriedade(db, usuario_atual, propriedade_id)
    animais = db.query(Animal).filter(Animal.propriedade_id == propriedade_id).all()
    return [_anexar_ultima_telemetria_animal(a) for a in animais]

@router.put("/{animal_id}", response_model=AnimalResposta)
def atualizar_animal(
    animal_id: int,
    animal_in: AnimalAtualizacao,
    db: Session = Depends(deps.get_db),
    usuario_atual: Usuario = Depends(deps.get_current_user)
):
    if not usuario_atual.pode_acessar_animais:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado: seu usuário não possui permissão para acessar o módulo de Animais.")

    animal = db.query(Animal).filter(Animal.id == animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Animal não encontrado.")

    prop = deps.verificar_acesso_propriedade(db, usuario_atual, animal.propriedade_id)
    props_conta_ids = deps.obter_propriedades_conta_ids(db, prop.usuario_id)

    if animal_in.dispositivo_id and animal_in.dispositivo_id != animal.dispositivo_id:
        dispositivo_existente = db.query(Animal).filter(
            Animal.dispositivo_id == animal_in.dispositivo_id,
            Animal.propriedade_id.in_(props_conta_ids),
            Animal.id != animal_id
        ).first()
        if dispositivo_existente:
            raise HTTPException(status_code=400, detail="Dispositivo IoT já cadastrado para outro animal na sua conta.")

    if animal_in.numero_brinco and animal_in.numero_brinco != animal.numero_brinco:
        brinco_existente = db.query(Animal).filter(
            Animal.numero_brinco == animal_in.numero_brinco,
            Animal.propriedade_id.in_(props_conta_ids),
            Animal.id != animal_id
        ).first()
        if brinco_existente:
            raise HTTPException(status_code=400, detail="Número da coleira já cadastrado na sua conta.")

    dados_atualizacao = animal_in.model_dump(exclude_unset=True)
    for campo, valor in dados_atualizacao.items():
        setattr(animal, campo, valor)

    db.commit()
    db.refresh(animal)

    # Dispara a atualização Over-The-Air via MQTT Downlink com retain=True
    publicar_configuracao_animal(
        dispositivo_id=animal.dispositivo_id,
        intervalo_gps_segundos=animal.intervalo_gps_segundos,
        intervalo_envio_segundos=animal.intervalo_envio_segundos,
        economia_energia=getattr(animal, "economia_energia", True)
    )

    return _anexar_ultima_telemetria_animal(animal)

@router.patch("/{animal_id}/economia-energia", response_model=AnimalResposta)
def alternar_modo_economia_energia(
    animal_id: int,
    db: Session = Depends(deps.get_db),
    usuario_atual: Usuario = Depends(deps.get_current_user)
):
    """
    Alterna o modo de economia de energia (Deep Sleep) do colar do animal e
    dispara imediatamente a configuração Over-The-Air via MQTT retained.
    """
    if not usuario_atual.pode_acessar_animais:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado: seu usuário não possui permissão para acessar o módulo de Animais.")

    animal = db.query(Animal).filter(Animal.id == animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Animal não encontrado.")

    deps.verificar_acesso_propriedade(db, usuario_atual, animal.propriedade_id)

    # Inverte o estado atual
    estado_atual = getattr(animal, "economia_energia", True)
    animal.economia_energia = not estado_atual
    db.commit()
    db.refresh(animal)

    # Despacha a nova configuração OTA via MQTT
    publicar_configuracao_animal(
        dispositivo_id=animal.dispositivo_id,
        intervalo_gps_segundos=animal.intervalo_gps_segundos,
        intervalo_envio_segundos=animal.intervalo_envio_segundos,
        economia_energia=animal.economia_energia
    )

    return _anexar_ultima_telemetria_animal(animal)

@router.delete("/{animal_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover_animal(
    animal_id: int,
    db: Session = Depends(deps.get_db),
    usuario_atual: Usuario = Depends(deps.get_current_user)
):
    if not usuario_atual.pode_acessar_animais:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado: seu usuário não possui permissão para acessar o módulo de Animais.")

    animal = db.query(Animal).filter(Animal.id == animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Animal não encontrado.")

    deps.verificar_acesso_propriedade(db, usuario_atual, animal.propriedade_id)

    db.delete(animal)
    db.commit()
    return None
