from typing import Dict, Any, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api import deps
from app.core.database import mongo_db
from app.models import Usuario, Animal, Equipamento, EstacaoAmbiental, Propriedade
from app.services.mqtt_subscriber import verificar_status_broker_mqtt

router = APIRouter()

def clean_mongo_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    if not doc:
        return {}
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc

@router.get("/status")
def obter_status_sistema_telemetria(
    propriedade_id: Optional[int] = None,
    db: Session = Depends(deps.get_db),
    usuario_atual: Optional[Usuario] = Depends(deps.get_optional_current_user)
):
    """
    Endpoint de verificação de status em tempo real da infraestrutura IoT.
    Verifica a conectividade real do Broker MQTT e do MongoDB, e quando autenticado,
    contabiliza apenas os sensores pertencentes às propriedades autorizadas do usuário.
    """
    broker_online = verificar_status_broker_mqtt()
    status_broker = "online" if broker_online else "offline"

    try:
        limite_tempo = (datetime.utcnow() - timedelta(minutes=10)).isoformat()

        if usuario_atual is not None:
            if propriedade_id is not None:
                deps.verificar_acesso_propriedade(db, usuario_atual, propriedade_id)
                props_ids = [propriedade_id]
            else:
                props_ids = deps.obter_propriedades_autorizadas_ids(db, usuario_atual)

            ids_anim = [
                a.dispositivo_id for a in db.query(Animal).filter(Animal.propriedade_id.in_(props_ids)).all()
            ] if (props_ids and usuario_atual.pode_acessar_animais) else []
            ids_equip = [
                e.dispositivo_id for e in db.query(Equipamento).filter(Equipamento.propriedade_id.in_(props_ids)).all()
            ] if (props_ids and usuario_atual.pode_acessar_equipamentos) else []
            ids_est = [
                s.dispositivo_id for s in db.query(EstacaoAmbiental).filter(EstacaoAmbiental.propriedade_id.in_(props_ids)).all()
            ] if (props_ids and usuario_atual.pode_acessar_estacoes) else []

            filtro_props = {
                "$or": [
                    {"propriedade_id": {"$in": props_ids}},
                    {"propriedade_id": {"$exists": False}},
                ]
            }

            ultima_anim = mongo_db["telemetria_animais"].find_one(
                {"dispositivo_id": {"$in": ids_anim}, **filtro_props}, sort=[("data_hora", -1)]
            ) if ids_anim else None
            ultima_equip = mongo_db["telemetria_equipamentos"].find_one(
                {"dispositivo_id": {"$in": ids_equip}, **filtro_props}, sort=[("data_hora", -1)]
            ) if ids_equip else None
            ultima_est = mongo_db["telemetria_estacoes"].find_one(
                {"dispositivo_id": {"$in": ids_est}, **filtro_props}, sort=[("data_hora", -1)]
            ) if ids_est else None

            anim_count = len(mongo_db["telemetria_animais"].distinct(
                "dispositivo_id",
                {"dispositivo_id": {"$in": ids_anim}, "data_hora": {"$gte": limite_tempo}, **filtro_props},
            )) if ids_anim else 0
            equip_count = len(mongo_db["telemetria_equipamentos"].distinct(
                "dispositivo_id",
                {"dispositivo_id": {"$in": ids_equip}, "data_hora": {"$gte": limite_tempo}, **filtro_props},
            )) if ids_equip else 0
            est_count = len(mongo_db["telemetria_estacoes"].distinct(
                "dispositivo_id",
                {"dispositivo_id": {"$in": ids_est}, "data_hora": {"$gte": limite_tempo}, **filtro_props},
            )) if ids_est else 0
        else:
            ultima_anim = None
            ultima_equip = None
            ultima_est = None
            anim_count = 0
            equip_count = 0
            est_count = 0

        sensores_ativos = anim_count + equip_count + est_count

        datas = []
        for d, k in [(ultima_anim, "data_hora"), (ultima_anim, "timestamp"),
                     (ultima_equip, "data_hora"), (ultima_equip, "timestamp"),
                     (ultima_est, "data_hora"), (ultima_est, "timestamp")]:
            if d and k in d:
                datas.append(str(d[k]))

        ultima_atividade = max(datas) if datas else None
        status_geral = "online" if broker_online else "degradado"

        return {
            "status": status_geral,
            "broker_mqtt": status_broker,
            "banco_dados": "online",
            "sensores_ativos": sensores_ativos,
            "ultima_atividade": ultima_atividade,
            # Compatibilidade
            "active_sensors_count": sensores_ativos,
            "last_activity": ultima_atividade,
            "mqtt_broker": status_broker,
            "database": "online"
        }
    except HTTPException:
        raise
    except Exception as e:
        return {
            "status": "degradado",
            "broker_mqtt": status_broker,
            "banco_dados": "erro",
            "sensores_ativos": 0,
            "ultima_atividade": None,
            "erro": str(e),
            "active_sensors_count": 0,
            "last_activity": None,
            "mqtt_broker": status_broker,
            "database": "error"
        }

def _filtro_mongo_dispositivo(dispositivo_id: str, propriedade_id: int) -> Dict[str, Any]:
    dev_str = str(dispositivo_id).strip()
    variacoes = list(dict.fromkeys([dev_str, dev_str.lower(), dev_str.upper(), dev_str.capitalize()]))
    return {
        "dispositivo_id": {"$in": variacoes} if len(variacoes) > 1 else dev_str,
        "$or": [{"propriedade_id": propriedade_id}, {"propriedade_id": {"$exists": False}}]
    }

@router.get("/ultima/{dispositivo_id}")
@router.get("/latest/{dispositivo_id}", include_in_schema=False)
def obter_ultima_telemetria_dispositivo(
    dispositivo_id: str,
    db: Session = Depends(deps.get_db),
    usuario_atual: Usuario = Depends(deps.get_current_user)
):
    item = deps.verificar_acesso_dispositivo(db, usuario_atual, dispositivo_id)
    filtro = _filtro_mongo_dispositivo(dispositivo_id, item.propriedade_id)

    doc_anim = (
        mongo_db["telemetria_animais"].find_one(filtro, sort=[("data_hora", -1)])
        or mongo_db["animal_telemetry"].find_one({"device_id": dispositivo_id}, sort=[("timestamp", -1)])
    )
    if doc_anim:
        return {"tipo": "animal", "dados": clean_mongo_doc(doc_anim), "type": "animal", "data": clean_mongo_doc(doc_anim)}

    doc_equip = (
        mongo_db["telemetria_equipamentos"].find_one(filtro, sort=[("data_hora", -1)])
        or mongo_db["equipment_telemetry"].find_one({"device_id": dispositivo_id}, sort=[("timestamp", -1)])
    )
    if doc_equip:
        return {"tipo": "equipamento", "dados": clean_mongo_doc(doc_equip), "type": "equipment", "data": clean_mongo_doc(doc_equip)}

    doc_est = (
        mongo_db["telemetria_estacoes"].find_one(filtro, sort=[("data_hora", -1)])
        or mongo_db["environment_telemetry"].find_one({"device_id": dispositivo_id}, sort=[("timestamp", -1)])
    )
    if doc_est:
        return {"tipo": "estacao_ambiental", "dados": clean_mongo_doc(doc_est), "type": "environment", "data": clean_mongo_doc(doc_est)}

    return {"tipo": "desconhecido", "dados": None, "type": "unknown", "data": None}


@router.get("/historico/{dispositivo_id}")
@router.get("/history/{dispositivo_id}", include_in_schema=False)
def obter_historico_telemetria_dispositivo(
    dispositivo_id: str,
    limite: int = 50,
    pular: int = 0,
    data: Optional[str] = None,
    data_inicio: Optional[str] = None,
    data_fim: Optional[str] = None,
    db: Session = Depends(deps.get_db),
    usuario_atual: Usuario = Depends(deps.get_current_user)
):
    """
    Retorna as medições históricas de um dispositivo específico gravadas no MongoDB,
    ordenadas das mais recentes para as mais antigas, com suporte a paginação (pular/limite) e filtro por data.
    """
    item = deps.verificar_acesso_dispositivo(db, usuario_atual, dispositivo_id)
    filtro = _filtro_mongo_dispositivo(dispositivo_id, item.propriedade_id)
    filtro_legado: Dict[str, Any] = {"device_id": dispositivo_id}

    if data_inicio and data_fim:
        inicio_cmp = data_inicio.rstrip("Z")
        fim_cmp = data_fim if data_fim.endswith("Z") else f"{data_fim}Z"
        filtro["data_hora"] = {"$gte": inicio_cmp, "$lte": fim_cmp}
        filtro_legado["timestamp"] = {"$gte": inicio_cmp, "$lte": fim_cmp}
    elif data:
        inicio_cmp = f"{data}T00:00:00"
        fim_cmp = f"{data}T23:59:59.999999Z"
        filtro["data_hora"] = {"$gte": inicio_cmp, "$lte": fim_cmp}
        filtro_legado["timestamp"] = {"$gte": inicio_cmp, "$lte": fim_cmp}

    limite = max(1, min(limite, 1000))
    pular_val = max(0, pular)

    # 1. Animal
    find_anim = mongo_db["telemetria_animais"].find(filtro, sort=[("data_hora", -1)])
    if pular_val > 0 and hasattr(find_anim, "skip"):
        find_anim = find_anim.skip(pular_val)
    cursor_anim = list(find_anim.limit(limite))

    if not cursor_anim and pular_val == 0:
        find_anim_leg = mongo_db["animal_telemetry"].find(filtro_legado, sort=[("timestamp", -1)])
        cursor_anim = list(find_anim_leg.limit(limite))

    if cursor_anim:
        dados = [clean_mongo_doc(d) for d in cursor_anim if isinstance(d, dict)]
        try:
            cnt = mongo_db["telemetria_animais"].count_documents(filtro)
            total_anim = int(cnt) if isinstance(cnt, (int, float)) else len(dados)
        except Exception:
            total_anim = len(dados)
        if total_anim < len(dados):
            total_anim = len(dados)

        return {
            "dispositivo_id": dispositivo_id,
            "tipo": "animal",
            "total": len(dados),
            "total_geral": total_anim,
            "tem_mais": (pular_val + len(dados)) < total_anim or len(dados) == limite,
            "pular": pular_val,
            "limite": limite,
            "medicoes": dados,
            # compatibilidade
            "device_id": dispositivo_id,
            "type": "animal",
            "records": dados
        }

    # 2. Equipamento
    find_equip = mongo_db["telemetria_equipamentos"].find(filtro, sort=[("data_hora", -1)])
    if pular_val > 0 and hasattr(find_equip, "skip"):
        find_equip = find_equip.skip(pular_val)
    cursor_equip = list(find_equip.limit(limite))

    if not cursor_equip and pular_val == 0:
        find_equip_leg = mongo_db["equipment_telemetry"].find(filtro_legado, sort=[("timestamp", -1)])
        cursor_equip = list(find_equip_leg.limit(limite))

    if cursor_equip:
        dados = [clean_mongo_doc(d) for d in cursor_equip if isinstance(d, dict)]
        try:
            cnt = mongo_db["telemetria_equipamentos"].count_documents(filtro)
            total_equip = int(cnt) if isinstance(cnt, (int, float)) else len(dados)
        except Exception:
            total_equip = len(dados)
        if total_equip < len(dados):
            total_equip = len(dados)

        return {
            "dispositivo_id": dispositivo_id,
            "tipo": "equipamento",
            "total": len(dados),
            "total_geral": total_equip,
            "tem_mais": (pular_val + len(dados)) < total_equip or len(dados) == limite,
            "pular": pular_val,
            "limite": limite,
            "medicoes": dados,
            # compatibilidade
            "device_id": dispositivo_id,
            "type": "equipment",
            "records": dados
        }

    # 3. Estação Ambiental
    find_est = mongo_db["telemetria_estacoes"].find(filtro, sort=[("data_hora", -1)])
    if pular_val > 0 and hasattr(find_est, "skip"):
        find_est = find_est.skip(pular_val)
    cursor_est = list(find_est.limit(limite))

    if not cursor_est and pular_val == 0:
        find_est_leg = mongo_db["environment_telemetry"].find(filtro_legado, sort=[("timestamp", -1)])
        cursor_est = list(find_est_leg.limit(limite))

    if cursor_est:
        dados = [clean_mongo_doc(d) for d in cursor_est if isinstance(d, dict)]
        try:
            cnt = mongo_db["telemetria_estacoes"].count_documents(filtro)
            total_est = int(cnt) if isinstance(cnt, (int, float)) else len(dados)
        except Exception:
            total_est = len(dados)
        if total_est < len(dados):
            total_est = len(dados)

        return {
            "dispositivo_id": dispositivo_id,
            "tipo": "estacao_ambiental",
            "total": len(dados),
            "total_geral": total_est,
            "tem_mais": (pular_val + len(dados)) < total_est or len(dados) == limite,
            "pular": pular_val,
            "limite": limite,
            "medicoes": dados,
            # compatibilidade
            "device_id": dispositivo_id,
            "type": "environment",
            "records": dados
        }

    return {
        "dispositivo_id": dispositivo_id,
        "tipo": "desconhecido",
        "total": 0,
        "total_geral": 0,
        "tem_mais": False,
        "pular": pular_val,
        "limite": limite,
        "medicoes": [],
        "device_id": dispositivo_id,
        "type": "unknown",
        "records": []
    }


@router.delete("/historico/{dispositivo_id}")
def limpar_historico_dispositivo(
    dispositivo_id: str,
    db: Session = Depends(deps.get_db),
    usuario_atual: Usuario = Depends(deps.get_current_user)
):
    """
    Remove todas as medições de telemetria de um dispositivo específico gravadas no MongoDB.
    Só é permitido ao usuário que tem acesso à propriedade à qual o dispositivo pertence.
    """
    item = deps.verificar_acesso_dispositivo(db, usuario_atual, dispositivo_id)
    filtro_principal = _filtro_mongo_dispositivo(dispositivo_id, item.propriedade_id)
    colecoes = [
        ("telemetria_animais", filtro_principal),
        ("animal_telemetry", {"device_id": dispositivo_id, "$or": [{"propriedade_id": item.propriedade_id}, {"propriedade_id": {"$exists": False}}]}),
        ("telemetria_equipamentos", filtro_principal),
        ("equipment_telemetry", {"device_id": dispositivo_id, "$or": [{"propriedade_id": item.propriedade_id}, {"propriedade_id": {"$exists": False}}]}),
        ("telemetria_estacoes", filtro_principal),
        ("environment_telemetry", {"device_id": dispositivo_id, "$or": [{"propriedade_id": item.propriedade_id}, {"propriedade_id": {"$exists": False}}]}),
    ]

    total_removido = 0
    for col_name, filtro_del in colecoes:
        res = mongo_db[col_name].delete_many(filtro_del)
        total_removido += res.deleted_count

    return {
        "mensagem": f"Histórico de medições do dispositivo '{dispositivo_id}' apagado com sucesso.",
        "dispositivo_id": dispositivo_id,
        "total_removido": total_removido
    }


def _coordenada_gps_valida(lat: Any, lng: Any) -> bool:
    if lat is None or lng is None:
        return False
    try:
        f_lat = float(lat)
        f_lng = float(lng)
        if f_lat == 0.0 and f_lng == 0.0:
            return False
        return -90.0 <= f_lat <= 90.0 and -180.0 <= f_lng <= 180.0
    except (ValueError, TypeError):
        return False


def _mesclar_ultimo_gps_valido(
    dados_telemetria: Dict[str, Any],
    colecao_pt: str,
    colecao_en: str,
    dispositivo_id: str,
    propriedade_id: int
) -> Dict[str, Any]:
    """
    Garante que o dicionário de telemetria tenha a última coordenada GPS válida conhecida
    do dispositivo caso a leitura mais recente tenha chegado sem sinal de GPS (vazia/nula).
    """
    if not dados_telemetria:
        return dados_telemetria

    if _coordenada_gps_valida(dados_telemetria.get("latitude"), dados_telemetria.get("longitude")):
        return dados_telemetria

    # Remove valores inválidos (como None ou 0,0) caso não exista nenhuma coordenada válida no histórico
    dados_telemetria["latitude"] = None
    dados_telemetria["longitude"] = None

    filtro_gps = {
        **_filtro_mongo_dispositivo(dispositivo_id, propriedade_id),
        "latitude": {"$nin": [None, 0, 0.0, ""], "$exists": True},
        "longitude": {"$nin": [None, 0, 0.0, ""], "$exists": True},
    }
    doc_gps = (
        mongo_db[colecao_pt].find_one(filtro_gps, sort=[("data_hora", -1)])
        or mongo_db[colecao_en].find_one(
            {
                "device_id": dispositivo_id,
                "latitude": {"$nin": [None, 0, 0.0, ""], "$exists": True},
                "longitude": {"$nin": [None, 0, 0.0, ""], "$exists": True},
            },
            sort=[("timestamp", -1)],
        )
    )
    if doc_gps and _coordenada_gps_valida(doc_gps.get("latitude"), doc_gps.get("longitude")):
        dados_telemetria["latitude"] = float(doc_gps["latitude"])
        dados_telemetria["longitude"] = float(doc_gps["longitude"])
        if dados_telemetria.get("altitude_m") is None and doc_gps.get("altitude_m") is not None:
            dados_telemetria["altitude_m"] = doc_gps["altitude_m"]
        if dados_telemetria.get("satelites") is None and doc_gps.get("satelites") is not None:
            dados_telemetria["satelites"] = doc_gps["satelites"]

    return dados_telemetria


@router.get("/propriedade/{propriedade_id}/visao-geral")
@router.get("/property/{propriedade_id}/overview", include_in_schema=False)
def obter_visao_geral_telemetria_propriedade(
    propriedade_id: int,
    db: Session = Depends(deps.get_db),
    usuario_atual: Usuario = Depends(deps.get_current_user)
):
    prop = deps.verificar_acesso_propriedade(db, usuario_atual, propriedade_id)

    animais = db.query(Animal).filter(Animal.propriedade_id == propriedade_id).all() if usuario_atual.pode_acessar_animais else []
    equipamentos = db.query(Equipamento).filter(Equipamento.propriedade_id == propriedade_id).all() if usuario_atual.pode_acessar_equipamentos else []
    estacoes = db.query(EstacaoAmbiental).filter(EstacaoAmbiental.propriedade_id == propriedade_id).all() if usuario_atual.pode_acessar_estacoes else []

    animais_resultado = []
    for a in animais:
        doc = (
            mongo_db["telemetria_animais"].find_one(_filtro_mongo_dispositivo(a.dispositivo_id, propriedade_id), sort=[("data_hora", -1)])
            or mongo_db["animal_telemetry"].find_one({"device_id": a.dispositivo_id}, sort=[("timestamp", -1)])
        )
        dados_telemetria = _mesclar_ultimo_gps_valido(
            clean_mongo_doc(doc),
            "telemetria_animais",
            "animal_telemetry",
            a.dispositivo_id,
            propriedade_id,
        )
        animais_resultado.append({
            "id": a.id,
            "numero_brinco": a.numero_brinco,
            "especie": a.especie,
            "raca": a.raca,
            "dispositivo_id": a.dispositivo_id,
            "ultima_telemetria": dados_telemetria,
            # chaves legadas para compatibilidade
            "tag_number": a.numero_brinco,
            "species": a.especie,
            "breed": a.raca,
            "device_id": a.dispositivo_id,
            "latest_telemetry": dados_telemetria
        })

    equipamentos_resultado = []
    for eq in equipamentos:
        doc = (
            mongo_db["telemetria_equipamentos"].find_one(_filtro_mongo_dispositivo(eq.dispositivo_id, propriedade_id), sort=[("data_hora", -1)])
            or mongo_db["equipment_telemetry"].find_one({"device_id": eq.dispositivo_id}, sort=[("timestamp", -1)])
        )
        dados_telemetria = _mesclar_ultimo_gps_valido(
            clean_mongo_doc(doc),
            "telemetria_equipamentos",
            "equipment_telemetry",
            eq.dispositivo_id,
            propriedade_id,
        )
        equipamentos_resultado.append({
            "id": eq.id,
            "nome": eq.nome,
            "tipo": eq.tipo,
            "modelo": eq.modelo,
            "dispositivo_id": eq.dispositivo_id,
            "ultima_telemetria": dados_telemetria,
            # chaves legadas para compatibilidade
            "name": eq.nome,
            "type": eq.tipo,
            "model": eq.modelo,
            "device_id": eq.dispositivo_id,
            "latest_telemetry": dados_telemetria
        })

    estacoes_resultado = []
    for st in estacoes:
        doc = (
            mongo_db["telemetria_estacoes"].find_one(_filtro_mongo_dispositivo(st.dispositivo_id, propriedade_id), sort=[("data_hora", -1)])
            or mongo_db["environment_telemetry"].find_one({"device_id": st.dispositivo_id}, sort=[("timestamp", -1)])
        )
        dados_telemetria = _mesclar_ultimo_gps_valido(
            clean_mongo_doc(doc),
            "telemetria_estacoes",
            "environment_telemetry",
            st.dispositivo_id,
            propriedade_id,
        )
        lat_telem = dados_telemetria.get("latitude") if dados_telemetria else None
        lng_telem = dados_telemetria.get("longitude") if dados_telemetria else None
        if _coordenada_gps_valida(lat_telem, lng_telem):
            lat_est = float(lat_telem)
            lng_est = float(lng_telem)
        elif _coordenada_gps_valida(st.latitude, st.longitude):
            lat_est = float(st.latitude)
            lng_est = float(st.longitude)
        else:
            lat_est = None
            lng_est = None

        estacoes_resultado.append({
            "id": st.id,
            "nome": st.nome,
            "latitude": lat_est,
            "longitude": lng_est,
            "dispositivo_id": st.dispositivo_id,
            "ultima_telemetria": dados_telemetria,
            # chaves legadas para compatibilidade
            "name": st.nome,
            "device_id": st.dispositivo_id,
            "latest_telemetry": dados_telemetria
        })

    return {
        "propriedade": {
            "id": prop.id,
            "nome": prop.nome,
            "poligono_geojson": prop.poligono_geojson
        },
        "animais": animais_resultado,
        "equipamentos": equipamentos_resultado,
        "estacoes_ambientais": estacoes_resultado,
        # Chaves em inglês para compatibilidade
        "property": {
            "id": prop.id,
            "name": prop.nome,
            "polygon_geojson": prop.poligono_geojson
        },
        "animals": animais_resultado,
        "equipments": equipamentos_resultado,
        "environment_stations": estacoes_resultado
    }
