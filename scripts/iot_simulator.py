import sys
import time
import json
import random

# Força o flush automático de logs no terminal Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)

try:
    import paho.mqtt.client as mqtt
except ImportError:
    print("\n[ERRO] A biblioteca 'paho-mqtt' não está instalada neste ambiente Python!")
    print("[DICA] Para instalar, execute:")
    print("       pip install paho-mqtt")
    print("       Ou certifique-se de ativar o ambiente virtual:")
    print("       .\\backend\\venv\\Scripts\\Activate.ps1\n")
    sys.exit(1)

import os

MQTT_BROKER = os.getenv("MQTT_BROKER_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_BROKER_PORT", "1883"))
MQTT_USER = os.getenv("MQTT_BROKER_USER", "SEU_USUARIO_MQTT")
MQTT_PASSWORD = os.getenv("MQTT_BROKER_PASSWORD", "SUA_SENHA_MQTT")

# Coordenadas base da propriedade (Fazenda Modelo - Catanduva/SP)
CENTER_LAT = -21.1370
CENTER_LNG = -48.9730

# IDs de dispositivos simulados
ANIMALS = [
    {"dispositivo_id": "ANIMAL_BOV_001", "tag": "BR-1001", "especie": "Bovino"},
    {"dispositivo_id": "ANIMAL_BOV_002", "tag": "BR-1002", "especie": "Bovino"},
    {"dispositivo_id": "ANIMAL_BOV_003", "tag": "BR-1003", "especie": "Bovino (Fuga/Alerta)"},
]

EQUIPMENTS = [
    {"dispositivo_id": "EQUIP_TRAC_01", "nome": "Trator John Deere 7230J"},
    {"dispositivo_id": "EQUIP_COLH_01", "nome": "Colheitadeira S700"},
]

STATIONS = [
    {"dispositivo_id": "ENV_STATION_01", "nome": "Estação Meteorológica Campo Norte", "lat": CENTER_LAT + 0.0010, "lng": CENTER_LNG + 0.0010},
    {"dispositivo_id": "ENV_STATION_02", "nome": "Estação Solo Pastagem Sul", "lat": CENTER_LAT - 0.0015, "lng": CENTER_LNG - 0.0015},
]

def generate_animal_telemetry(animal):
    dev_id = animal["dispositivo_id"]
    agora = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    
    # Se for o animal 003, simula fuga para fora do perímetro e febre ocasional
    if dev_id == "ANIMAL_BOV_003":
        lat = CENTER_LAT + random.uniform(0.015, 0.025)  # Fora do perímetro
        lng = CENTER_LNG + random.uniform(0.015, 0.025)
        temp = round(random.uniform(39.6, 40.8), 1)     # Febre
        hr = random.randint(115, 135)
    else:
        lat = CENTER_LAT + random.uniform(-0.003, 0.003)
        lng = CENTER_LNG + random.uniform(-0.003, 0.003)
        temp = round(random.uniform(38.0, 39.1), 1)
        hr = random.randint(60, 90)

    acel = {
        "x": round(random.uniform(-0.5, 0.5), 2),
        "y": round(random.uniform(-0.5, 0.5), 2),
        "z": round(random.uniform(9.5, 10.1), 2)
    }

    return {
        "dispositivo_id": dev_id,
        "device_id": dev_id,
        "latitude": round(lat, 6),
        "longitude": round(lng, 6),
        "temperatura_corporal": temp,
        "body_temperature": temp,
        "frequencia_cardiaca": hr,
        "heart_rate": hr,
        "acelerometro": acel,
        "accelerometer": acel,
        "data_hora": agora,
        "timestamp": agora
    }

def generate_equipment_telemetry(eq):
    dev_id = eq["dispositivo_id"]
    agora = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    speed = round(random.uniform(5.0, 22.0), 1)
    
    return {
        "dispositivo_id": dev_id,
        "device_id": dev_id,
        "latitude": round(CENTER_LAT + random.uniform(-0.002, 0.002), 6),
        "longitude": round(CENTER_LNG + random.uniform(-0.002, 0.002), 6),
        "velocidade": speed,
        "speed": speed,
        "status_motor": "LIGADO",
        "engine_status": "ON",
        "data_hora": agora,
        "timestamp": agora
    }

def generate_env_telemetry(st):
    dev_id = st["dispositivo_id"]
    agora = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    # Simula solo seco na estação 02 para disparar alerta
    soil = round(random.uniform(12.0, 18.0) if dev_id == "ENV_STATION_02" else random.uniform(35.0, 65.0), 1)
    temp = round(random.uniform(23.0, 32.0), 1)
    hum = round(random.uniform(45.0, 75.0), 1)
    
    return {
        "dispositivo_id": dev_id,
        "device_id": dev_id,
        "temperatura": temp,
        "temperature": temp,
        "umidade": hum,
        "humidity": hum,
        "pressao_atmosferica": 1013.25,
        "atmospheric_pressure": 1013.25,
        "umidade_solo": soil,
        "soil_moisture": soil,
        "data_hora": agora,
        "timestamp": agora
    }

def main():
    print(f"[Simulador IoT] Conectando ao Broker MQTT em {MQTT_BROKER}:{MQTT_PORT}...", flush=True)
    
    # Compatibilidade paho-mqtt v1.x e v2.x
    try:
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1)
    except AttributeError:
        client = mqtt.Client()

    try:
        if MQTT_USER and MQTT_PASSWORD:
            client.username_pw_set(MQTT_USER, MQTT_PASSWORD)
        client.connect(MQTT_BROKER, MQTT_PORT, 60)
        print("[Simulador IoT] Conectado com sucesso! Transmitindo telemetrias a cada 5 segundos...", flush=True)
    except Exception as e:
        print(f"\n[ERRO DE CONEXÃO MQTT] Falha ao conectar em {MQTT_BROKER}:{MQTT_PORT}: {e}", flush=True)
        print("[DICA] Certifique-se de que o Broker MQTT (Mosquitto) está em execução:", flush=True)
        print("       Verifique o host, a porta e as credenciais configuradas.\n", flush=True)
        return

    client.loop_start()
    try:
        ciclo = 1
        while True:
            print(f"\n--- [Ciclo #{ciclo}] Transmitindo dados dos sensores ---", flush=True)
            # 1. Enviar Animais
            for anim in ANIMALS:
                data = generate_animal_telemetry(anim)
                topic = f"fazenda/telemetria/animal/{anim['dispositivo_id']}"
                client.publish(topic, json.dumps(data))
                print(f"  [Bovino {anim['tag']}] Lat: {data['latitude']}, Lng: {data['longitude']}, Temp: {data['temperatura_corporal']}°C, BPM: {data['frequencia_cardiaca']}", flush=True)

            # 2. Enviar Equipamentos
            for eq in EQUIPMENTS:
                data = generate_equipment_telemetry(eq)
                topic = f"fazenda/telemetria/equipamento/{eq['dispositivo_id']}"
                client.publish(topic, json.dumps(data))
                print(f"  [Equipamento {eq['nome']}] Vel: {data['velocidade']} km/h, Status: {data['status_motor']}", flush=True)

            # 3. Enviar Estações Ambientais
            for st in STATIONS:
                data = generate_env_telemetry(st)
                topic = f"fazenda/telemetria/estacao/{st['dispositivo_id']}"
                client.publish(topic, json.dumps(data))
                print(f"  [Estação {st['nome']}] Temp: {data['temperatura']}°C, Umid Solo: {data['umidade_solo']}%", flush=True)

            ciclo += 1
            time.sleep(5)
    except KeyboardInterrupt:
        print("\n[Simulador IoT] Encerrado pelo usuário.", flush=True)
        client.loop_stop()
        client.disconnect()

if __name__ == "__main__":
    main()
