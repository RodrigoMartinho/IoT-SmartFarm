import json
import paho.mqtt.client as mqtt
from app.core.config import settings

def publicar_configuracao_animal(
    dispositivo_id: str,
    intervalo_gps_segundos: int,
    intervalo_envio_segundos: int,
    economia_energia: bool = True
):
    """
    Publica a nova configuração no broker MQTT com retain=True para que o ESP32 receba imediatamente,
    inclusive ao reconectar após períodos sem sinal ou com a bateria desligada.
    """
    try:
        # Compatibilidade com paho-mqtt 1.x e 2.x
        try:
            client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1)
        except AttributeError:
            client = mqtt.Client()
        
        if settings.MQTT_BROKER_USER and settings.MQTT_BROKER_PASSWORD:
            client.username_pw_set(settings.MQTT_BROKER_USER, settings.MQTT_BROKER_PASSWORD)
        client.connect(settings.MQTT_BROKER_HOST, settings.MQTT_BROKER_PORT, 10)
        topico = f"fazenda/configuracao/animal/{dispositivo_id}"
        payload = json.dumps({
            "dispositivo_id": dispositivo_id,
            "intervalo_gps_segundos": intervalo_gps_segundos,
            "intervalo_envio_segundos": intervalo_envio_segundos,
            "economia_energia": bool(economia_energia)
        })
        client.publish(topico, payload, qos=1, retain=True)
        client.disconnect()
        print(f"[MQTT Downlink] Configuração publicada para {topico}: {payload} (retain=True)")
    except Exception as e:
        print(f"[MQTT Downlink] Erro ao publicar configuração MQTT para {dispositivo_id}: {e}")

def publicar_configuracao_equipamento(
    dispositivo_id: str,
    intervalo_envio_segundos: int
):
    """
    Publica a nova configuração de transmissão do equipamento no broker MQTT com retain=True.
    """
    try:
        try:
            client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1)
        except AttributeError:
            client = mqtt.Client()

        if settings.MQTT_BROKER_USER and settings.MQTT_BROKER_PASSWORD:
            client.username_pw_set(settings.MQTT_BROKER_USER, settings.MQTT_BROKER_PASSWORD)
        client.connect(settings.MQTT_BROKER_HOST, settings.MQTT_BROKER_PORT, 10)
        topico = f"fazenda/configuracao/equipamento/{dispositivo_id}"
        payload = json.dumps({
            "dispositivo_id": dispositivo_id,
            "tipo": "equipamento",
            "intervalo_envio_segundos": int(intervalo_envio_segundos)
        })
        client.publish(topico, payload, qos=1, retain=True)
        client.disconnect()
        print(f"[MQTT Downlink] Configuração de equipamento publicada para {topico}: {payload} (retain=True)")
    except Exception as e:
        print(f"[MQTT Downlink] Erro ao publicar configuração MQTT para equipamento {dispositivo_id}: {e}")


