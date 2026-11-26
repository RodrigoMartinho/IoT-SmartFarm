import json
from unittest.mock import patch
import pytest
from app.models import Usuario, Propriedade, Animal, Alerta
from app.services import mqtt_subscriber

class FakeMsg:
    """Simula uma mensagem recebida do broker MQTT."""
    def __init__(self, topic: str, payload_dict: dict):
        self.topic = topic
        self.payload = json.dumps(payload_dict).encode("utf-8")


class MockCollection:
    """Simula uma coleção MongoDB em memória para testes."""
    def __init__(self):
        self.docs = []

    def insert_one(self, doc):
        self.docs.append(dict(doc))

    def insert_many(self, docs):
        for d in docs:
            self.docs.append(dict(d))


class FakeMongoDb:
    """Simula o cliente/banco PyMongo com acesso por colchetes."""
    def __init__(self, colecoes):
        self.colecoes = colecoes

    def __getitem__(self, name):
        if name not in self.colecoes:
            self.colecoes[name] = MockCollection()
        return self.colecoes[name]


@pytest.fixture
def mock_mongo():
    """Substitui o banco MongoDB por coleções em memória durante o teste."""
    colecoes = {
        "telemetria_animais": MockCollection(),
        "animal_telemetry": MockCollection(),
        "telemetria_equipamentos": MockCollection(),
        "equipment_telemetry": MockCollection(),
        "telemetria_estacoes": MockCollection(),
        "environment_telemetry": MockCollection(),
    }
    fake_db = FakeMongoDb(colecoes)
    with patch.object(mqtt_subscriber, "mongo_db", fake_db):
        yield colecoes


@pytest.fixture
def animal_bovino(db_session, usuario_admin, poligono_fazenda):
    """Cria uma propriedade e um animal cadastrado no banco em memória."""
    propriedade = Propriedade(
        usuario_id=usuario_admin.id,
        nome="Fazenda Santa Fé",
        descricao="Fazenda para testes de telemetria",
        poligono_geojson=poligono_fazenda
    )
    db_session.add(propriedade)
    db_session.commit()
    db_session.refresh(propriedade)

    animal = Animal(
        propriedade_id=propriedade.id,
        numero_brinco="BR-TESTE-01",
        especie="Bovino",
        raca="Nelore",
        dispositivo_id="DEV_BOV_TESTE_01",
        intervalo_gps_segundos=15,
        intervalo_envio_segundos=60
    )
    db_session.add(animal)
    db_session.commit()
    db_session.refresh(animal)
    return animal


from tests.conftest import TestingSessionLocal


def test_single_telemetry_ingestion(db_session, animal_bovino, mock_mongo):
    """Testa recebimento de telemetria individual padrão."""
    dev_id = animal_bovino.dispositivo_id
    payload = {
        "dispositivo_id": dev_id,
        "latitude": -21.137000,
        "longitude": -48.970000,
        "temperatura_corporal": 38.5,
        "frequencia_cardiaca": 72,
        "data_hora": "2026-09-15T10:00:00Z"
    }
    msg = FakeMsg(f"fazenda/telemetria/animal/{dev_id}", payload)

    with patch("app.services.mqtt_subscriber.SessionLocal", TestingSessionLocal):
        mqtt_subscriber.on_message(None, None, msg)

    docs_inseridos = mock_mongo["telemetria_animais"].docs
    assert len(docs_inseridos) == 1
    assert docs_inseridos[0]["dispositivo_id"] == dev_id
    assert docs_inseridos[0]["temperatura_corporal"] == 38.5


def test_batch_telemetry_store_and_forward(db_session, animal_bovino, mock_mongo):
    """Testa descompactação de lote store-and-forward gerado pelo ESP32-C6."""
    dev_id = animal_bovino.dispositivo_id
    payload_lote = {
        "dispositivo_id": dev_id,
        "total_medicoes": 3,
        "medicoes": [
            {
                "latitude": -21.137100,
                "longitude": -48.970100,
                "temperatura_corporal": 38.4,
                "frequencia_cardiaca": 70,
                "data_hora": "2026-09-15T10:01:00Z"
            },
            {
                "latitude": -21.137200,
                "longitude": -48.970200,
                "temperatura_corporal": 38.5,
                "frequencia_cardiaca": 72,
                "data_hora": "2026-09-15T10:02:00Z"
            },
            {
                "latitude": -21.137300,
                "longitude": -48.970300,
                "temperatura_corporal": 38.6,
                "frequencia_cardiaca": 74,
                "data_hora": "2026-09-15T10:03:00Z"
            }
        ]
    }
    msg = FakeMsg(f"fazenda/telemetria/animal/{dev_id}", payload_lote)

    with patch("app.services.mqtt_subscriber.SessionLocal", TestingSessionLocal):
        mqtt_subscriber.on_message(None, None, msg)

    docs_inseridos = mock_mongo["telemetria_animais"].docs
    assert len(docs_inseridos) == 3
    for ponto in docs_inseridos:
        assert ponto["dispositivo_id"] == dev_id
        assert "data_hora" in ponto


def test_geofence_alarm_trigger(db_session, animal_bovino, mock_mongo):
    """Testa geração de alarme quando animal ultrapassa o limite da propriedade."""
    dev_id = animal_bovino.dispositivo_id
    # Coordenadas fora do polígono da fazenda
    payload_fuga = {
        "dispositivo_id": dev_id,
        "latitude": -21.180000,
        "longitude": -49.020000,
        "temperatura_corporal": 38.5,
        "frequencia_cardiaca": 75,
        "data_hora": "2026-09-15T10:05:00Z"
    }
    msg = FakeMsg(f"fazenda/telemetria/animal/{dev_id}", payload_fuga)

    with patch("app.services.mqtt_subscriber.SessionLocal", TestingSessionLocal):
        mqtt_subscriber.on_message(None, None, msg)

    alerta = db_session.query(Alerta).filter(
        Alerta.dispositivo_id == dev_id,
        Alerta.tipo == "CERCA_VIRTUAL"
    ).first()

    assert alerta is not None
    assert alerta.severidade == "CRITICA"
    assert alerta.esta_ativo is True
    assert "saiu do perímetro" in alerta.mensagem


def test_fever_and_tachycardia_alarms(db_session, animal_bovino, mock_mongo):
    """Testa disparos de alarme para febre (> 39.5 °C) e frequência cardíaca anormal (> 120 bpm)."""
    dev_id = animal_bovino.dispositivo_id
    payload_saude = {
        "dispositivo_id": dev_id,
        "latitude": -21.137000,
        "longitude": -48.970000,
        "temperatura_corporal": 40.5,  # Febre alta
        "frequencia_cardiaca": 135,    # Taquicardia
        "data_hora": "2026-09-15T10:10:00Z"
    }
    msg = FakeMsg(f"fazenda/telemetria/animal/{dev_id}", payload_saude)

    with patch("app.services.mqtt_subscriber.SessionLocal", TestingSessionLocal):
        mqtt_subscriber.on_message(None, None, msg)

    alerta_febre = db_session.query(Alerta).filter(
        Alerta.dispositivo_id == dev_id,
        Alerta.tipo == "FEBRE"
    ).first()
    assert alerta_febre is not None
    assert "está com febre" in alerta_febre.mensagem

    alerta_cardiaco = db_session.query(Alerta).filter(
        Alerta.dispositivo_id == dev_id,
        Alerta.tipo == "FREQUENCIA_CARDIACA"
    ).first()
    assert alerta_cardiaco is not None
    assert "Frequência cardíaca anormal" in alerta_cardiaco.mensagem


def test_prevent_duplicate_active_alarms(db_session, animal_bovino, mock_mongo):
    """Garante que mensagens consecutivas com a mesma anomalia não duplicam alertas ativos."""
    dev_id = animal_bovino.dispositivo_id
    payload = {
        "dispositivo_id": dev_id,
        "latitude": -21.180000,
        "longitude": -49.020000,
        "temperatura_corporal": 40.2,
        "frequencia_cardiaca": 70,
        "data_hora": "2026-09-15T10:15:00Z"
    }
    msg = FakeMsg(f"fazenda/telemetria/animal/{dev_id}", payload)

    with patch("app.services.mqtt_subscriber.SessionLocal", TestingSessionLocal):
        # Envia a primeira vez
        mqtt_subscriber.on_message(None, None, msg)
        # Envia a segunda vez com o mesmo problema
        mqtt_subscriber.on_message(None, None, msg)

    total_febre = db_session.query(Alerta).filter(
        Alerta.dispositivo_id == dev_id,
        Alerta.tipo == "FEBRE",
        Alerta.esta_ativo == True
    ).count()

    assert total_febre == 1


def test_ingest_ambiental_v25_payload_and_case_insensitive(db_session, usuario_admin, poligono_fazenda, mock_mongo):
    """Testa ingestão do payload 2.5-mqtt-direto, normalização de chaves, data_hora UTC e busca case-insensitive."""
    from app.models import EstacaoAmbiental

    prop = Propriedade(
        nome="Fazenda Ambiental",
        usuario_id=usuario_admin.id,
        poligono_geojson=poligono_fazenda,
    )
    db_session.add(prop)
    db_session.commit()
    db_session.refresh(prop)

    # Cadastrado em minúsculas no banco, mas firmware envia "Ambiental_01"
    estacao = EstacaoAmbiental(
        propriedade_id=prop.id,
        nome="Estação Água e Solo",
        dispositivo_id="ambiental_01",
    )
    db_session.add(estacao)
    db_session.commit()

    payload_colega = {
        "registro_id": "R-AAE910E824B0CB18",
        "dispositivo_id": "Ambiental_01",
        "firmware": "2.5-mqtt-direto",
        "tipo": "automatico",
        "data_hora": "2026-11-11T17:13:35",
        "temperatura_solo_C": 28.87,
        "temperatura_ar_C": 31.02,
        "umidade_ar_percentual": 70.92,
        "temperatura_bmp_C": 31.50,
        "pressao_hPa": 953.72,
        "chuva": False,
        "luminosidade_adc": 0,
        "umidade_solo_adc": 1972,
        "umidade_solo_percentual": 71.4,
        "mq2_adc": 0,
        "latitude": -21.187153,
        "longitude": -48.909580,
        "satelites": 8,
        "altitude_m": 544.4,
    }
    msg = FakeMsg("fazenda/ambiental/Ambiental_01", payload_colega)

    with patch("app.services.mqtt_subscriber.SessionLocal", TestingSessionLocal):
        mqtt_subscriber.on_message(None, None, msg)

    docs = mock_mongo["telemetria_estacoes"].docs
    assert len(docs) == 1
    doc = docs[0]
    assert doc["propriedade_id"] == prop.id
    assert doc["data_hora"] == "2026-11-11T17:13:35Z"
    assert doc["temperatura_solo"] == 28.87
    assert doc["temperatura"] == 31.02
    assert doc["umidade"] == 70.92
    assert doc["pressao_atmosferica"] == 953.72
    assert doc["umidade_solo"] == 71.4

    db_session.refresh(estacao)
    assert estacao.latitude == pytest.approx(-21.187153)
    assert estacao.longitude == pytest.approx(-48.909580)
