import json
import socket
import threading
from typing import Any, Optional, Dict, List
from datetime import datetime, timezone
import paho.mqtt.client as mqtt
from app.core.config import settings
from app.core.database import SessionLocal, mongo_db
from sqlalchemy import func
from app.models import Usuario, Animal, Equipamento, EstacaoAmbiental, Propriedade, Alerta
from app.services.geofence import is_point_inside_polygon

MQTT_CONNECTED = False


def on_connect(client, userdata, flags, rc):
    global MQTT_CONNECTED
    MQTT_CONNECTED = (rc == 0)
    print(f"[MQTT Subscriber] Conectado ao Broker MQTT com código: {rc}")
    # Tópicos em português e legado
    client.subscribe("fazenda/telemetria/animal/+")
    client.subscribe("fazenda/telemetria/equipamento/+")
    client.subscribe("fazenda/telemetria/estacao/+")
    client.subscribe("fazenda/telemetria/estacao")
    client.subscribe("fazenda/telemetria/ambiental/+")
    client.subscribe("fazenda/telemetria/ambiental")
    client.subscribe("fazenda/estacao/+")
    client.subscribe("fazenda/estacao")
    client.subscribe("fazenda/ambiental/+")
    client.subscribe("fazenda/ambiental")
    client.subscribe("farm/telemetry/animal/+")
    client.subscribe("farm/telemetry/equipment/+")
    client.subscribe("farm/telemetry/environment/+")
    client.subscribe("farm/telemetry/environment")
    print("[MQTT Subscriber] Inscrito nos tópicos de telemetria da fazenda.")


def on_disconnect(client, userdata, rc):
    global MQTT_CONNECTED
    MQTT_CONNECTED = False
    print(f"[MQTT Subscriber] Desconectado do Broker MQTT (rc={rc}).")


def verificar_status_broker_mqtt() -> bool:
    """
    Verifica em tempo real se o broker MQTT está conectado ou acessível via TCP.
    """
    if MQTT_CONNECTED:
        return True
    try:
        with socket.create_connection((settings.MQTT_BROKER_HOST, int(settings.MQTT_BROKER_PORT)), timeout=0.5):
            return True
    except Exception:
        return False


def _resolver_dispositivo_por_conta(db, modelo, dispositivo_id: str, usuario_email: str = None):
    """
    Valida no PostgreSQL se a conta informada existe e possui o dispositivo cadastrado.
    Retorna (entidade, None) em caso de sucesso ou (None, codigo_erro) em caso de rejeição.
    Realiza busca case-insensitive e com trim para evitar falhas de grafia.
    """
    dev_id_str = str(dispositivo_id).strip() if dispositivo_id else ""
    if not dev_id_str:
        return None, "DISPOSITIVO_NAO_CADASTRADO"

    if usuario_email and str(usuario_email).strip():
        email_limpo = str(usuario_email).strip().lower()
        usuario = db.query(Usuario).filter(func.lower(Usuario.email) == email_limpo).first()
        if not usuario:
            return None, "CONTA_NAO_ENCONTRADA"

        conta_id = usuario.administrador_id if usuario.administrador_id else usuario.id
        props_ids = [p[0] for p in db.query(Propriedade.id).filter(Propriedade.usuario_id == conta_id).all()]
        if not props_ids:
            return None, "DISPOSITIVO_NAO_CADASTRADO"

        item = db.query(modelo).filter(
            func.lower(func.trim(modelo.dispositivo_id)) == dev_id_str.lower(),
            modelo.propriedade_id.in_(props_ids)
        ).first()
        if not item:
            return None, "DISPOSITIVO_NAO_CADASTRADO"
        return item, None

    # Fallback sem e-mail informado: busca case-insensitive no banco
    item = db.query(modelo).filter(
        func.lower(func.trim(modelo.dispositivo_id)) == dev_id_str.lower()
    ).first()
    if not item:
        return None, "DISPOSITIVO_NAO_CADASTRADO"
    return item, None


def _publicar_erro_vinculacao(client, categoria: str, dispositivo_id: str, usuario_email: str, codigo_erro: str):
    """
    Envia feedback via MQTT Downlink ao ESP32 quando a conta ou o dispositivo não são encontrados,
    permitindo que o firmware avise no Monitor Serial e reabra o portal de configuração se necessário.
    """
    print(
        f"[MQTT Subscriber] Telemetria rejeitada ({codigo_erro}): "
        f"dispositivo='{dispositivo_id}', conta='{usuario_email}'."
    )
    if client is not None and hasattr(client, "publish") and dispositivo_id:
        try:
            topico_cfg = f"fazenda/configuracao/{categoria}/{dispositivo_id}"
            payload_erro = json.dumps({
                "dispositivo_id": dispositivo_id,
                "usuario_email": usuario_email,
                "erro": codigo_erro,
                "mensagem": (
                    f"A conta '{usuario_email}' nao existe no SmartFarm."
                    if codigo_erro == "CONTA_NAO_ENCONTRADA"
                    else f"Dispositivo '{dispositivo_id}' nao cadastrado para a conta '{usuario_email or 'padrao'}'."
                )
            })
            client.publish(topico_cfg, payload_erro, qos=1, retain=False)
        except Exception as e:
            print(f"[MQTT Subscriber] Falha ao publicar erro de vinculação para {dispositivo_id}: {e}")


def _publicar_confirmacao_lote(client, categoria: str, dispositivo_id: str, lote_id: Any, total_salvo: int):
    """
    Envia feedback de confirmação (ACK Downlink) via MQTT para dispositivos que operam
    com Store-and-Forward (ex: Estação Ambiental, Colar de Animais, Tratores).
    Permite que o microcontrolador ESP32 só limpe sua memória RTC/flash após a gravação
    confirmada no MongoDB.
    """
    if client is not None and hasattr(client, "publish") and dispositivo_id and lote_id is not None:
        try:
            topico_ack = f"fazenda/confirmacao/{categoria}/{dispositivo_id}"
            payload_ack = json.dumps({
                "dispositivo_id": dispositivo_id,
                "lote_id": lote_id,
                "status": "SUCESSO",
                "registros_salvos": total_salvo,
                "data_hora_confirmacao": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
            }, separators=(",", ":"))
            client.publish(topico_ack, payload_ack, qos=1, retain=False)
            print(f"[MQTT Subscriber] ACK publicado para {dispositivo_id} no tópico '{topico_ack}' (lote={lote_id}, registros={total_salvo}).")
        except Exception as e:
            print(f"[MQTT Subscriber] Falha ao publicar confirmação de lote para {dispositivo_id}: {e}")


def on_message(client, userdata, msg):
    try:
        topic = msg.topic
        raw_payload = json.loads(msg.payload.decode('utf-8'))
        
        # Identifica se é mensagem em lote (store-and-forward) ou medição individual
        medicoes = []
        dispositivo_id_raiz = None
        usuario_email_raiz = None
        lote_id = None

        if isinstance(raw_payload, dict):
            dispositivo_id_raiz = raw_payload.get("dispositivo_id") or raw_payload.get("device_id")
            usuario_email_raiz = (
                raw_payload.get("usuario_email")
                or raw_payload.get("user_email")
                or raw_payload.get("email_conta")
            )
            lote_id = raw_payload.get("lote_id") if "lote_id" in raw_payload else raw_payload.get("batch_id")
            if "medicoes" in raw_payload and isinstance(raw_payload["medicoes"], list):
                medicoes = raw_payload["medicoes"]
            else:
                medicoes = [raw_payload]
        elif isinstance(raw_payload, list):
            medicoes = raw_payload

        if not medicoes:
            return

        if lote_id is None and medicoes and isinstance(medicoes[0], dict):
            lote_id = medicoes[0].get("lote_id") if "lote_id" in medicoes[0] else medicoes[0].get("batch_id")

        # Formato ISO 8601 estrito com sufixo Z (ex: 2026-10-15T13:45:00.000Z)
        agora_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")

        # Normaliza cada medição individual do lote
        for ponto in medicoes:
            if not isinstance(ponto, dict):
                continue

            # Herda o ID do dispositivo raiz se não estiver no ponto
            if dispositivo_id_raiz:
                if "dispositivo_id" not in ponto and "device_id" not in ponto:
                    ponto["dispositivo_id"] = dispositivo_id_raiz
                    ponto["device_id"] = dispositivo_id_raiz
                elif "dispositivo_id" not in ponto and "device_id" in ponto:
                    ponto["dispositivo_id"] = ponto["device_id"]
                elif "device_id" not in ponto and "dispositivo_id" in ponto:
                    ponto["device_id"] = ponto["dispositivo_id"]

            if usuario_email_raiz and "usuario_email" not in ponto:
                ponto["usuario_email"] = str(usuario_email_raiz).strip().lower()

            if "satelites" not in ponto and "satellites" in ponto:
                ponto["satelites"] = ponto["satellites"]

            # Garante data_hora e timestamp válidos com padrão ISO 8601 UTC
            val_data = ponto.get("data_hora") or ponto.get("timestamp")
            if not val_data:
                ponto["data_hora"] = agora_iso
                ponto["timestamp"] = agora_iso
            else:
                s_data = str(val_data).strip()
                if "Z" not in s_data and "+" not in s_data[10:] and "-" not in s_data[10:]:
                    s_data = f"{s_data}Z"
                ponto["data_hora"] = s_data
                ponto["timestamp"] = s_data

        primeiro_ponto = medicoes[0] if isinstance(medicoes[0], dict) else {}
        dispositivo_id = dispositivo_id_raiz or primeiro_ponto.get("dispositivo_id") or primeiro_ponto.get("device_id")

        # Fallback: extrai dispositivo_id do próprio tópico MQTT caso não venha explícito no JSON
        if not dispositivo_id and "/" in topic:
            partes_topico = topic.strip().rstrip('/').split('/')
            if len(partes_topico) >= 4 and partes_topico[-1] not in ("+", "#", "", "ambiental", "estacao", "environment", "animal", "equipamento", "equipment"):
                dispositivo_id = partes_topico[-1]

        # Garante que todos os pontos do lote recebam o dispositivo_id resolvido
        if dispositivo_id:
            for ponto in medicoes:
                if isinstance(ponto, dict) and "dispositivo_id" not in ponto and "device_id" not in ponto:
                    ponto["dispositivo_id"] = dispositivo_id

        usuario_email = (
            usuario_email_raiz
            or primeiro_ponto.get("usuario_email")
            or primeiro_ponto.get("user_email")
            or primeiro_ponto.get("email_conta")
        )

        db = SessionLocal()
        try:
            # 1. Telemetria de animais
            if "animal" in topic:
                animal, erro = _resolver_dispositivo_por_conta(db, Animal, dispositivo_id, usuario_email)
                if erro or not animal:
                    _publicar_erro_vinculacao(client, "animal", dispositivo_id, usuario_email, erro or "DISPOSITIVO_NAO_CADASTRADO")
                    return

                docs_animais = []
                for p in medicoes:
                    if isinstance(p, dict):
                        doc_copia = dict(p)
                        doc_copia["propriedade_id"] = animal.propriedade_id
                        if "acelerometro" not in doc_copia and (
                            "acelerometro_x" in doc_copia
                            or "acelerometro_y" in doc_copia
                            or "acelerometro_z" in doc_copia
                        ):
                            doc_copia["acelerometro"] = {
                                "x": doc_copia.get("acelerometro_x", 0.0),
                                "y": doc_copia.get("acelerometro_y", 0.0),
                                "z": doc_copia.get("acelerometro_z", 0.0),
                            }
                        docs_animais.append(doc_copia)

                if docs_animais:
                    mongo_db["telemetria_animais"].insert_many(docs_animais)
                    if lote_id is not None:
                        _publicar_confirmacao_lote(client, "animal", dispositivo_id, lote_id, len(docs_animais))

                if animal.propriedade:
                    for ponto in medicoes:
                        if not isinstance(ponto, dict):
                            continue
                        lat = ponto.get("latitude")
                        lng = ponto.get("longitude")
                        temp_corp = ponto.get("temperatura_corporal", ponto.get("body_temperature", 38.5))
                        freq_card = ponto.get("frequencia_cardiaca", ponto.get("heart_rate", 70))

                        # Cercamento virtual (geofence)
                        if lat is not None and lng is not None and animal.propriedade.poligono_geojson:
                            dentro = is_point_inside_polygon(lat, lng, animal.propriedade.poligono_geojson)
                            if not dentro:
                                criar_alerta_se_nao_existir(
                                    db=db,
                                    propriedade_id=animal.propriedade_id,
                                    dispositivo_id=dispositivo_id,
                                    tipo="CERCA_VIRTUAL",
                                    severidade="CRITICA",
                                    mensagem=f"🚨 Alerta! O animal ({animal.numero_brinco}) saiu do perímetro da fazenda '{animal.propriedade.nome}'!"
                                )

                        # Febre (ignora leituras marcadas como inválidas pelo colar)
                        sensor_temp_ok = ponto.get("sensor_temp_ok", True) is not False
                        if sensor_temp_ok and temp_corp and temp_corp > 39.5:
                            criar_alerta_se_nao_existir(
                                db=db,
                                propriedade_id=animal.propriedade_id,
                                dispositivo_id=dispositivo_id,
                                tipo="FEBRE",
                                severidade="ALTA",
                                mensagem=f"🌡️ Alerta de saúde! O animal ({animal.numero_brinco}) está com febre ({temp_corp}°C)."
                            )

                        # Frequência cardíaca anormal
                        if freq_card and (freq_card > 120 or freq_card < 45):
                            criar_alerta_se_nao_existir(
                                db=db,
                                propriedade_id=animal.propriedade_id,
                                dispositivo_id=dispositivo_id,
                                tipo="FREQUENCIA_CARDIACA",
                                severidade="ALTA",
                                mensagem=f"💓 Alerta! Frequência cardíaca anormal no animal ({animal.numero_brinco}): {freq_card} bpm."
                            )

            # 2. Telemetria de equipamentos
            elif "equipamento" in topic or "equipment" in topic:
                equip, erro = _resolver_dispositivo_por_conta(db, Equipamento, dispositivo_id, usuario_email)
                if erro or not equip:
                    _publicar_erro_vinculacao(client, "equipamento", dispositivo_id, usuario_email, erro or "DISPOSITIVO_NAO_CADASTRADO")
                    return

                docs_equip = []
                for item in medicoes:
                    if isinstance(item, dict):
                        doc_copia = dict(item)
                        doc_copia["propriedade_id"] = equip.propriedade_id
                        docs_equip.append(doc_copia)
                if docs_equip:
                    mongo_db["telemetria_equipamentos"].insert_many(docs_equip)
                    if lote_id is not None:
                        _publicar_confirmacao_lote(client, "equipamento", dispositivo_id, lote_id, len(docs_equip))

            # 3. Telemetria ambiental
            elif "estacao" in topic or "environment" in topic or "ambiental" in topic:
                estacao, erro = _resolver_dispositivo_por_conta(db, EstacaoAmbiental, dispositivo_id, usuario_email)
                if erro or not estacao:
                    _publicar_erro_vinculacao(client, "estacao", dispositivo_id, usuario_email, erro or "DISPOSITIVO_NAO_CADASTRADO")
                    return

                docs_est = []
                for item in medicoes:
                    if isinstance(item, dict):
                        doc_copia = dict(item)
                        doc_copia["propriedade_id"] = estacao.propriedade_id

                        # Normaliza aliases comuns de sensores ambientais para garantir exibição no frontend
                        if "temperatura" not in doc_copia:
                            doc_copia["temperatura"] = doc_copia.get("temperatura_ar_C", doc_copia.get("temperatura_bmp_C", doc_copia.get("temperature")))
                        if "temperatura_ar_C" not in doc_copia and doc_copia.get("temperatura") is not None:
                            doc_copia["temperatura_ar_C"] = doc_copia["temperatura"]
                        if "temperatura_solo" not in doc_copia and doc_copia.get("temperatura_solo_C") is not None:
                            doc_copia["temperatura_solo"] = doc_copia["temperatura_solo_C"]
                        if "temperatura_solo_C" not in doc_copia and doc_copia.get("temperatura_solo") is not None:
                            doc_copia["temperatura_solo_C"] = doc_copia["temperatura_solo"]
                        if "umidade" not in doc_copia:
                            doc_copia["umidade"] = doc_copia.get("umidade_ar_percentual", doc_copia.get("humidity"))
                        if "umidade_ar_percentual" not in doc_copia and doc_copia.get("umidade") is not None:
                            doc_copia["umidade_ar_percentual"] = doc_copia["umidade"]
                        if "pressao_atmosferica" not in doc_copia:
                            doc_copia["pressao_atmosferica"] = doc_copia.get("pressao_hPa", doc_copia.get("atmospheric_pressure"))
                        if "pressao_hPa" not in doc_copia and doc_copia.get("pressao_atmosferica") is not None:
                            doc_copia["pressao_hPa"] = doc_copia["pressao_atmosferica"]
                        if "umidade_solo" not in doc_copia:
                            if "umidade_solo_percentual" in doc_copia:
                                doc_copia["umidade_solo"] = doc_copia["umidade_solo_percentual"]
                            elif "soil_moisture" in doc_copia:
                                doc_copia["umidade_solo"] = doc_copia["soil_moisture"]
                            elif "umidade_solo_adc" in doc_copia:
                                adc = doc_copia["umidade_solo_adc"]
                                pct = max(0.0, min(100.0, round((4095 - adc) / (4095 - 1500) * 100, 1)))
                                doc_copia["umidade_solo"] = pct
                        if "umidade_solo_percentual" not in doc_copia and doc_copia.get("umidade_solo") is not None:
                            doc_copia["umidade_solo_percentual"] = doc_copia["umidade_solo"]

                        docs_est.append(doc_copia)
                        if doc_copia.get("latitude") is not None and doc_copia.get("longitude") is not None:
                            try:
                                estacao.latitude = float(doc_copia["latitude"])
                                estacao.longitude = float(doc_copia["longitude"])
                                db.commit()
                            except Exception:
                                pass
                if docs_est:
                    mongo_db["telemetria_estacoes"].insert_many(docs_est)
                    if lote_id is not None:
                        _publicar_confirmacao_lote(client, "estacao", dispositivo_id, lote_id, len(docs_est))
                    
                if estacao.propriedade:
                    for item in docs_est:
                        if not isinstance(item, dict):
                            continue
                        umidade_solo = item.get("umidade_solo", 50.0)
                        if umidade_solo and umidade_solo < 20.0:
                            criar_alerta_se_nao_existir(
                                db=db,
                                propriedade_id=estacao.propriedade_id,
                                dispositivo_id=dispositivo_id,
                                tipo="SOLO_SECO",
                                severidade="MEDIA",
                                mensagem=f"🌵 Solo seco! Estação '{estacao.nome}' registrou umidade do solo em {umidade_solo}%. Necessidade de irrigação."
                            )
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
    except Exception as e:
        print(f"[MQTT Subscriber Error] Falha ao processar mensagem do tópico {msg.topic}: {e}")


def criar_alerta_se_nao_existir(db, propriedade_id: int, dispositivo_id: str, tipo: str, severidade: str, mensagem: str):
    # Evita duplicação de alertas ativos
    existente = db.query(Alerta).filter(
        Alerta.propriedade_id == propriedade_id,
        Alerta.dispositivo_id == dispositivo_id,
        Alerta.tipo == tipo,
        Alerta.esta_ativo == True
    ).first()
    
    if not existente:
        novo_alerta = Alerta(
            propriedade_id=propriedade_id,
            dispositivo_id=dispositivo_id,
            tipo=tipo,
            severidade=severidade,
            mensagem=mensagem,
            esta_ativo=True
        )
        db.add(novo_alerta)
        db.commit()


def start_mqtt_listener():
    """Inicia o cliente MQTT em segundo plano."""
    try:
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1)
    except AttributeError:
        client = mqtt.Client()
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_message = on_message

    def run():
        global MQTT_CONNECTED
        try:
            if settings.MQTT_BROKER_USER and settings.MQTT_BROKER_PASSWORD:
                client.username_pw_set(settings.MQTT_BROKER_USER, settings.MQTT_BROKER_PASSWORD)
            client.connect(settings.MQTT_BROKER_HOST, settings.MQTT_BROKER_PORT, 60)
            client.loop_forever()
        except Exception as e:
            MQTT_CONNECTED = False
            print(f"[MQTT Listener Thread] Erro ao conectar ao broker MQTT: {e}")

    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    print("[MQTT Subscriber] Service iniciado em background thread.")

