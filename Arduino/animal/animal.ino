#include <Wire.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <WiFiManager.h>
#include <vector>
#include <Preferences.h>
#include <TinyGPSPlus.h>
#include "MAX30105.h"   
#include "heartRate.h"  
#include <math.h>
#include <time.h>
#include <driver/gpio.h> 
#include <esp_sleep.h>
#include "common.h"
#include "portal_ui.h"
#include "secrets.h"

// ==============================================================================
// Configuração de hardware e pinos (ESP32-C6 mini)
// ==============================================================================
// Barramento I2C compartilhado (GY-MAX30102 + GY-BMI160):
#define SDA_PIN 19
#define SCL_PIN 20

// Sensor de temperatura corporal DS18B20
#define DS18B20_PIN 5

// GPS ATGM336H
#define RX_PIN 2 
#define TX_PIN 3

// Botão BOOT
#define BOTAO_CONFIG 9

// ==============================================================================
// Estrutura e armazenamento de medições (Store-and-Forward)
// ==============================================================================
#define MAX_FILA_MEDICOES 30

struct PontoHistorico {
  double lat;
  double lng;
  float temp;
  float ax;
  float ay;
  float az;
  float forcaG;
  int freq;
  int sat;
  long ir;
  int estadoId;  // 0 = deitado/ruminação, 1 = em pé/parado, 2 = caminhada/pastando, 3 = corrida
  bool fixGps;
  bool tempOk;   // true = leitura válida do DS18B20 neste ciclo
  bool freqOk;   // true = leitura válida do MAX30102 neste ciclo
  bool bmiOk;    // true = leitura válida do BMI160 neste ciclo
  char timestampIso[24];  // "YYYY-MM-DDTHH:MM:SSZ"
};

RTC_DATA_ATTR int contadorCiclos = 0;
RTC_DATA_ATTR int totalPontosFila = 0;
RTC_DATA_ATTR PontoHistorico filaMedicoes[MAX_FILA_MEDICOES];
RTC_DATA_ATTR uint32_t loteIdAtual = 0;

uint32_t loteAguardandoAck = 0;
bool loteConfirmadoServidor = false;

// ==============================================================================
// Parâmetros dinâmicos (salvos na memória NVS)
// ==============================================================================
Preferences preferences;

String device_id = "";
String usuario_email = "";
String mqtt_topic = "";
String mqtt_ack_topic = "";

// ==============================================================================
// Objetos e clientes
// ==============================================================================
WiFiClient espClient;
PubSubClient mqttClient(espClient);
WiFiManager wm;

TinyGPSPlus gps;
MAX30105 maxSensor;

bool dsConectado = false;
int sdaAtivo = SDA_PIN;
int sclAtivo = SCL_PIN;
bool maxConectado = false;
bool bmiConectado = false;
uint8_t bmiAddr = 0x68;

// ==============================================================================
// Driver 1-Wire Open-Drain de alta precisão para DS18B20 no ESP32-C6 (GPIO 5)
// ==============================================================================
void ds18b20ConfigurarPino() {
  gpio_reset_pin((gpio_num_t)DS18B20_PIN);
  gpio_set_direction((gpio_num_t)DS18B20_PIN, GPIO_MODE_INPUT_OUTPUT_OD);
  gpio_pullup_en((gpio_num_t)DS18B20_PIN);
  gpio_set_level((gpio_num_t)DS18B20_PIN, 1);
}

static inline void ds18b20DriveLow() {
  gpio_set_level((gpio_num_t)DS18B20_PIN, 0);
}

static inline void ds18b20Release() {
  gpio_set_level((gpio_num_t)DS18B20_PIN, 1);
}

static inline int ds18b20ReadBitPin() {
  return gpio_get_level((gpio_num_t)DS18B20_PIN);
}

bool ds18b20Reset() {
  ds18b20Release();
  delayMicroseconds(5);
  ds18b20DriveLow();
  delayMicroseconds(490);
  ds18b20Release();
  delayMicroseconds(70);
  int presenca = ds18b20ReadBitPin();
  delayMicroseconds(420);
  return (presenca == 0);
}

void ds18b20WriteBit(uint8_t bit) {
  if (bit & 1) {
    ds18b20DriveLow();
    delayMicroseconds(6);
    ds18b20Release();
    delayMicroseconds(64);
  } else {
    ds18b20DriveLow();
    delayMicroseconds(65);
    ds18b20Release();
    delayMicroseconds(10);
  }
}

uint8_t ds18b20ReadBit() {
  ds18b20DriveLow();
  delayMicroseconds(3);
  ds18b20Release();
  delayMicroseconds(10);
  uint8_t bit = (uint8_t)ds18b20ReadBitPin();
  delayMicroseconds(55);
  return bit;
}

void ds18b20WriteByte(uint8_t byte) {
  for (uint8_t i = 0; i < 8; i++) {
    ds18b20WriteBit((byte >> i) & 1);
  }
}

uint8_t ds18b20ReadByte() {
  uint8_t res = 0;
  for (uint8_t i = 0; i < 8; i++) {
    if (ds18b20ReadBit()) {
      res |= (1 << i);
    }
  }
  return res;
}

uint8_t ds18b20Crc8(const uint8_t *addr, uint8_t len) {
  uint8_t crc = 0;
  while (len--) {
    uint8_t inbyte = *addr++;
    for (uint8_t i = 8; i; i--) {
      uint8_t mix = (crc ^ inbyte) & 0x01;
      crc >>= 1;
      if (mix) crc ^= 0x8C;
      inbyte >>= 1;
    }
  }
  return crc;
}

bool iniciarConversaoDS18B20() {
  if (!ds18b20Reset()) return false;
  ds18b20WriteByte(0xCC);  // Skip ROM
  ds18b20WriteByte(0x44);  // Convert T
  return true;
}

bool lerTemperaturaDS18B20(float &tempOut) {
  if (!ds18b20Reset()) return false;
  ds18b20WriteByte(0xCC);  // Skip ROM
  ds18b20WriteByte(0xBE);  // Read Scratchpad

  uint8_t data[9];
  for (uint8_t i = 0; i < 9; i++) {
    data[i] = ds18b20ReadByte();
  }

  bool todosFF = true;
  for (uint8_t i = 0; i < 9; i++) {
    if (data[i] != 0xFF) todosFF = false;
  }
  if (todosFF) return false;

  if (ds18b20Crc8(data, 8) != data[8]) return false;

  int16_t raw = (int16_t)((data[1] << 8) | data[0]);
  float t = (float)raw / 16.0f;
  if (t < -40.0f || t > 85.0f) return false;

  // Descarta leitura padrão de power-on reset do DS18B20 (exatamente 85.0 °C)
  if (fabs(t - 85.0f) < 0.05f) {
    Serial.println(" - DS18B20 Leitura de 85.0°C descartada");
    return false;
  }

  tempOut = t;
  return true;
}

// ==============================================================================
// Detecção I2C e inicialização direta do BMI160 (sem travar os pinos do ESP32-C6)
// ==============================================================================
bool i2cTestarEndereco(uint8_t addr) {
  Wire.beginTransmission(addr);
  return (Wire.endTransmission() == 0);
}

void verificarBarramentoI2C() {
  Wire.begin(SDA_PIN, SCL_PIN, 100000);
  delay(15);
  bool achou19_20 = i2cTestarEndereco(0x57) || i2cTestarEndereco(0x68) || i2cTestarEndereco(0x69);

  if (achou19_20) {
    sdaAtivo = SDA_PIN;
    sclAtivo = SCL_PIN;
  } else {
    Wire.end();
    delay(10);
    Wire.begin(SCL_PIN, SDA_PIN, 100000);
    delay(15);
    bool achou20_19 = i2cTestarEndereco(0x57) || i2cTestarEndereco(0x68) || i2cTestarEndereco(0x69);
    if (achou20_19) {
      sdaAtivo = SCL_PIN;
      sclAtivo = SDA_PIN;
    } else {
      Wire.end();
      Wire.begin(SDA_PIN, SCL_PIN, 100000);
      sdaAtivo = SDA_PIN;
      sclAtivo = SCL_PIN;
    }
  }
}

bool iniciarBMI160Direto() {
  uint8_t addrs[2] = {0x68, 0x69};
  for (int a = 0; a < 2; a++) {
    uint8_t tentativaAddr = addrs[a];
    Wire.beginTransmission(tentativaAddr);
    Wire.write(0x00);
    if (Wire.endTransmission(false) == 0) {
      Wire.requestFrom((int)tentativaAddr, 1);
      if (Wire.available()) {
        uint8_t chipId = Wire.read();
        if (chipId == 0xD1) {
          bmiAddr = tentativaAddr;
          // Normal mode para acelerômetro
          Wire.beginTransmission(bmiAddr);
          Wire.write(0x7E);
          Wire.write(0x11);
          Wire.endTransmission();
          delay(50);
          // Configura ±4g
          Wire.beginTransmission(bmiAddr);
          Wire.write(0x41);
          Wire.write(0x05);
          Wire.endTransmission();
          delay(10);
          return true;
        }
      }
    }
  }
  return false;
}

bool lerAcelerometroBMI160(float &ax, float &ay, float &az) {
  if (!bmiConectado) return false;
  Wire.beginTransmission(bmiAddr);
  Wire.write(0x12);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((int)bmiAddr, 6) != 6) return false;

  int16_t rawX = (int16_t)(Wire.read() | (Wire.read() << 8));
  int16_t rawY = (int16_t)(Wire.read() | (Wire.read() << 8));
  int16_t rawZ = (int16_t)(Wire.read() | (Wire.read() << 8));

  // Escala para ±4g: 8192 LSB/g
  ax = (float)rawX / 8192.0f;
  ay = (float)rawY / 8192.0f;
  az = (float)rawZ / 8192.0f;
  return true;
}

// ==============================================================================
// MAX30102: Inicialização e algoritmo de batimentos cardíacos
// ==============================================================================
long ultimoIR = 0;
int mediaBPM = 0;
unsigned long ultimoContatoMs = 0;
unsigned long ultimoBatimentoMs = 0;

void configurarMax30102() {
  maxSensor.setup(0x1F, 4, 2, 100, 411, 4096);
  maxSensor.setPulseAmplitudeRed(0x0A);
  maxSensor.setPulseAmplitudeIR(0x1F);
}

void drenarFifoMax30102() {
  if (!maxConectado) return;
  maxSensor.check();
  while (maxSensor.available()) {
    long irValue = maxSensor.getFIFOIR();
    maxSensor.nextSample();
    ultimoIR = irValue;

    if (irValue > 20000) {
      ultimoContatoMs = millis();
      if (checkForBeat(irValue)) {
        unsigned long agora = millis();
        long delta = agora - ultimoBatimentoMs;
        ultimoBatimentoMs = agora;

        if (delta > 300 && delta < 2000) {
          float bpmCalculado = 60.0 / (delta / 1000.0);
          if (bpmCalculado >= 40 && bpmCalculado <= 190) {
            if (mediaBPM == 0) {
              mediaBPM = (int)bpmCalculado;
            } else {
              mediaBPM = (mediaBPM * 3 + (int)bpmCalculado) / 4;
            }
          }
        }
      }
    }
  }
}

// ==============================================================================
// Callbacks e Mensageria MQTT
// ==============================================================================
void saveConfigCallback() {
  Serial.println("Formulário salvo via WiFiManager.");
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  char mensagem[384];
  if (length >= sizeof(mensagem)) length = sizeof(mensagem) - 1;
  memcpy(mensagem, payload, length);
  mensagem[length] = '\0';

  String strTopic = String(topic);
  String strPayload = String(mensagem);

  // 1. Confirmação de recebimento (ACK Downlink) do Backend
  if (strTopic.indexOf("confirmacao") >= 0) {
    if (strPayload.indexOf("\"SUCESSO\"") >= 0) {
      String buscaLoteCompacto = "\"lote_id\":" + String(loteAguardandoAck);
      String buscaLoteEspaco = "\"lote_id\": " + String(loteAguardandoAck);
      if (strPayload.indexOf(buscaLoteCompacto) >= 0 || strPayload.indexOf(buscaLoteEspaco) >= 0 || loteAguardandoAck == 0) {
        Serial.printf("\n Backend confirmou gravacao do lote #%u no MongoDB! Fila zerada (%d ponto(s) salvos).\n",
                      loteAguardandoAck, totalPontosFila);
        totalPontosFila = 0; // Zera a fila com 100% de garantia
        loteConfirmadoServidor = true;
      }
    }
    return;
  }

  // 2. Erros de vinculação
  if (strPayload.indexOf("CONTA_NAO_ENCONTRADA") >= 0) {
    Serial.println("\n ERRO! A conta informada nao existe no SmartFarm!");
    preferences.begin("smartfarm", false);
    preferences.putString("email", "");
    preferences.putBool("config_ok", false);
    preferences.end();
    delay(2000);
    ESP.restart();
  } else if (strPayload.indexOf("DISPOSITIVO_NAO_CADASTRADO") >= 0) {
    Serial.println("\n ERRO DE VINCULACAO - Animal ainda nao cadastrado nesta conta no painel web.");
  }

  // 3. Configuração Remota OTA enviada pelo Backend (via Web / App)
  if (strTopic.indexOf("configuracao") >= 0) {
    Serial.printf("\n Configuração recebida vai MQTT do painel web: %s\n", strPayload.c_str());

    // Economia de Energia (Deep Sleep)
    if (strPayload.indexOf("\"economia_energia\":true") >= 0 || strPayload.indexOf("\"economia_energia\": true") >= 0) {
      preferences.putBool("eco_energia", true);
      Serial.println(" -> Economia de Energia ATIVADA remotamente.");
    } else if (strPayload.indexOf("\"economia_energia\":false") >= 0 || strPayload.indexOf("\"economia_energia\": false") >= 0) {
      preferences.putBool("eco_energia", false);
      Serial.println(" -> Economia de Energia DESATIVADA remotamente.");
    }

    // Intervalo único de Coleta, Envio MQTT e Deep Sleep
    int idxEnv = strPayload.indexOf("\"intervalo_envio_segundos\":");
    if (idxEnv >= 0) {
      int fimEnv = strPayload.indexOf(",", idxEnv);
      if (fimEnv < 0) fimEnv = strPayload.indexOf("}", idxEnv);
      if (fimEnv > idxEnv) {
        int valEnv = strPayload.substring(idxEnv + 27, fimEnv).toInt();
        if (valEnv >= 5) {
          preferences.putInt("int_envio", valEnv);
          Serial.printf(" -> Intervalo de coleta/envio/sono atualizado para: %d segundos.\n", valEnv);
        }
      }
    } else {
      // Fallback caso receba apenas intervalo_gps_segundos
      int idxGps = strPayload.indexOf("\"intervalo_gps_segundos\":");
      if (idxGps >= 0) {
        int fimGps = strPayload.indexOf(",", idxGps);
        if (fimGps < 0) fimGps = strPayload.indexOf("}", idxGps);
        if (fimGps > idxGps) {
          int valGps = strPayload.substring(idxGps + 25, fimGps).toInt();
          if (valGps >= 5) {
            preferences.putInt("int_envio", valGps);
            Serial.printf(" -> Intervalo de coleta/envio/sono atualizado para: %d segundos.\n", valGps);
          }
        }
      }
    }
  }
}

// ==============================================================================
// Sincronização e formatação de Data/Hora (ISO 8601 UTC)
// ==============================================================================
String obterTimestampISO() {
  struct tm timeinfo;
  if (getLocalTime(&timeinfo, 100)) {
    char buf[25];
    sprintf(buf, "%04d-%02d-%02dT%02d:%02d:%02dZ",
            timeinfo.tm_year + 1900, timeinfo.tm_mon + 1, timeinfo.tm_mday,
            timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);
    return String(buf);
  }
  if (gps.time.isValid() && gps.date.isValid() && gps.date.year() >= 2026) {
    char buf[25];
    sprintf(buf, "%04d-%02d-%02dT%02d:%02d:%02dZ",
            gps.date.year(), gps.date.month(), gps.date.day(),
            gps.time.hour(), gps.time.minute(), gps.time.second());
    return String(buf);
  }
  return "";
}

// ==============================================================================
// Fila e Montagem de JSON de Telemetria
// ==============================================================================
float ultimaTemp = 38.5;
bool ultimaTempValida = false;
bool ultimaFreqValida = false;
bool ultimoBmiValido = false;
float ax_val = 0, ay_val = 0, az_val = 1.0, ultimaForcaG = 1.0;
String ultimoEstado = "Em pé (Caminhada / Pastando)";
int ultimoEstadoId = 2;

void enfileirarMedicaoAtual() {
  if (totalPontosFila >= MAX_FILA_MEDICOES) {
    for (int i = 0; i < MAX_FILA_MEDICOES - 1; i++) {
      filaMedicoes[i] = filaMedicoes[i + 1];
    }
    totalPontosFila = MAX_FILA_MEDICOES - 1;
  }

  double lat = 0.0, lng = 0.0;
  bool gpsValido = gps.location.isValid();
  if (gpsValido) {
    lat = gps.location.lat();
    lng = gps.location.lng();
  }

  filaMedicoes[totalPontosFila].lat = lat;
  filaMedicoes[totalPontosFila].lng = lng;
  filaMedicoes[totalPontosFila].temp = ultimaTemp;
  filaMedicoes[totalPontosFila].ax = ax_val;
  filaMedicoes[totalPontosFila].ay = ay_val;
  filaMedicoes[totalPontosFila].az = az_val;
  filaMedicoes[totalPontosFila].forcaG = ultimaForcaG;
  filaMedicoes[totalPontosFila].freq = mediaBPM;
  filaMedicoes[totalPontosFila].sat = gps.satellites.isValid() ? gps.satellites.value() : 0;
  filaMedicoes[totalPontosFila].ir = ultimoIR;
  filaMedicoes[totalPontosFila].estadoId = ultimoEstadoId;
  filaMedicoes[totalPontosFila].fixGps = gpsValido;
  filaMedicoes[totalPontosFila].tempOk = ultimaTempValida;
  filaMedicoes[totalPontosFila].freqOk = ultimaFreqValida;
  filaMedicoes[totalPontosFila].bmiOk = ultimoBmiValido;

  String iso = obterTimestampISO();
  strncpy(filaMedicoes[totalPontosFila].timestampIso, iso.c_str(), sizeof(filaMedicoes[totalPontosFila].timestampIso) - 1);
  filaMedicoes[totalPontosFila].timestampIso[sizeof(filaMedicoes[totalPontosFila].timestampIso) - 1] = '\0';

  totalPontosFila++;
  Serial.printf("Ponto registrado na fila (%d/%d armazenados).\n", totalPontosFila, MAX_FILA_MEDICOES);
}

String gerarJSONLoteTelemetria() {
  loteIdAtual++;
  loteAguardandoAck = loteIdAtual;
  loteConfirmadoServidor = false;

  String json = "{\"dispositivo_id\":\"" + device_id + "\",\"usuario_email\":\"" + usuario_email + "\",\"lote_id\":" + String(loteIdAtual) + ",\"total_medicoes\":" + String(totalPontosFila) + ",\"medicoes\":[";

  for (int i = 0; i < totalPontosFila; i++) {
    if (i > 0) json += ",";
    String item = "{";
    item += "\"satelites\":" + String(filaMedicoes[i].sat);
    item += ",\"fix_gps\":" + String(filaMedicoes[i].fixGps ? "true" : "false");

    if (strlen(filaMedicoes[i].timestampIso) > 0) {
      item += ",\"data_hora\":\"" + String(filaMedicoes[i].timestampIso) + "\"";
    }

    if (filaMedicoes[i].fixGps) {
      char bufGps[64];
      snprintf(bufGps, sizeof(bufGps), ",\"latitude\":%.6f,\"longitude\":%.6f", filaMedicoes[i].lat, filaMedicoes[i].lng);
      item += String(bufGps);
    }

    if (filaMedicoes[i].tempOk) {
      char bufTemp[32];
      snprintf(bufTemp, sizeof(bufTemp), ",\"temperatura_corporal\":%.2f", filaMedicoes[i].temp);
      item += String(bufTemp);
    }

    if (filaMedicoes[i].freqOk) {
      item += ",\"frequencia_cardiaca\":" + String(filaMedicoes[i].freq);
      item += ",\"sinal_ir\":" + String(filaMedicoes[i].ir);
    }

    if (filaMedicoes[i].bmiOk) {
      const char* estadoTexto = (filaMedicoes[i].estadoId == 3) ? "Movimento intenso / corrida"
                              : (filaMedicoes[i].estadoId == 2) ? "Em pé (Caminhada / Pastando)"
                              : (filaMedicoes[i].estadoId == 0) ? "Deitado (Repouso / Ruminação)"
                              : "Em pé (Repouso)";

      char bufBmi[160];
      snprintf(bufBmi, sizeof(bufBmi),
               ",\"acelerometro_x\":%.2f,\"acelerometro_y\":%.2f,\"acelerometro_z\":%.2f,\"estado_atividade\":\"%s\",\"em_repouso\":%s,\"forca_g\":%.2f",
               filaMedicoes[i].ax, filaMedicoes[i].ay, filaMedicoes[i].az,
               estadoTexto, (filaMedicoes[i].estadoId == 0) ? "true" : "false", filaMedicoes[i].forcaG);
      item += String(bufBmi);
    }

    item += "}";
    json += item;
  }
  json += "]}";
  return json;
}

// ==============================================================================
// Coleta de dados dos sensores
// ==============================================================================
void coletarDadosSensores() {
  Serial.println("\n Iniciando ciclo de amostragem dos sensores:");

  //DS18B20: Temperatura
  if (!dsConectado) {
    ds18b20ConfigurarPino();
    dsConectado = ds18b20Reset();
  }
  if (dsConectado) {
    iniciarConversaoDS18B20();
    delay(750);  // Tempo de conversão de 12 bits
    float tLida = 0;
    if (lerTemperaturaDS18B20(tLida)) {
      ultimaTemp = tLida;
      ultimaTempValida = true;
      Serial.printf(" - Sensor DS18B20: %.2f °C\n", ultimaTemp);
    } else {
      ultimaTempValida = false;
      Serial.println(" - Sensor DS18B20: falha de leitura ou cabo desconectado");
    }
  }

  //BMI160: Acelerômetro
  if (!bmiConectado) {
    bmiConectado = iniciarBMI160Direto();
  }
  if (bmiConectado) {
    if (lerAcelerometroBMI160(ax_val, ay_val, az_val)) {
      ultimoBmiValido = true;
      float mag = sqrt(ax_val * ax_val + ay_val * ay_val + az_val * az_val);
      ultimaForcaG = mag;

      int estadoAtual = 1;
      const char* atividade = "Em pé (Repouso)";

      if (mag > 1.35f || fabs(ax_val) > 0.8f) {
        estadoAtual = 3;
        atividade = "Movimento intenso / corrida";
      } else if (fabs(az_val) < 0.45f && (fabs(ax_val) > 0.55f || fabs(ay_val) > 0.55f)) {
        estadoAtual = 0;
        atividade = "Deitado (Repouso / Ruminação)";
      } else if (mag > 1.08f || fabs(ay_val) > 0.35f) {
        estadoAtual = 2;
        atividade = "Em pé (Caminhada / Pastando)";
      }

      ultimoEstado = atividade;
      ultimoEstadoId = estadoAtual;
      Serial.printf(" - Movimento: força g=%.2fg (ax=%.2f, ay=%.2f, az=%.2f) | Postura: %s\n",
                    mag, ax_val, ay_val, az_val, atividade);
    } else {
      bmiConectado = false;
      Serial.println(" - BMI160: falha na leitura I2C");
    }
  }

  //MAX30102: Frequência cardíaca
  if (!maxConectado) {
    if (maxSensor.begin(Wire, I2C_SPEED_STANDARD)) {
      maxConectado = true;
      configurarMax30102();
      Serial.println(" - Sensor MAX30102 reconectado!");
    }
  }
  if (maxConectado) {
    unsigned long inicioAmostragem = millis();
    while (millis() - inicioAmostragem < (ultimoIR > 20000 ? 5000UL : 400UL)) {
      checarBotaoBoot();
      drenarFifoMax30102();
      if (ultimoIR > 20000 && mediaBPM >= 40 && (millis() - ultimoBatimentoMs < 3000) && (millis() - inicioAmostragem > 2000)) {
        break;
      }
      delay(5);
    }
    if ((millis() - ultimoContatoMs < 10000) && mediaBPM >= 40 && mediaBPM <= 190) {
      ultimaFreqValida = true;
    } else {
      ultimaFreqValida = false;
      if (ultimoIR < 20000) mediaBPM = 0;
    }
    Serial.printf(" - Sinal óptico IR: %ld | Batimentos: %d bpm (%s)\n",
                  ultimoIR, mediaBPM, ultimaFreqValida ? "valido" : (ultimoIR > 20000 ? "aguardando estabilizar pulso" : "sem contato no sensor optico"));
  }

  //GPS ATGM336H
  unsigned long inicioGPS = millis();
  while (millis() - inicioGPS < 1500) {
    checarBotaoBoot();
    while (Serial1.available() > 0) {
      gps.encode(Serial1.read());
    }
    delay(10);
  }

  if (gps.location.isValid()) {
    Serial.printf(" - GPS: Satélites=%d | Lat=%.6f | Lng=%.6f\n",
                  gps.satellites.value(), gps.location.lat(), gps.location.lng());
  } else {
    Serial.printf(" - GPS: Satélites=%d (aguardando satélites)\n",
                  gps.satellites.value());
  }
}

// ==============================================================================
// Transmissão e Gestão de Sono
// ==============================================================================
void processarConectividade() {
  int intervaloCiclo = preferences.getInt("int_envio", 30);
  if (intervaloCiclo < 5) intervaloCiclo = 5;

  if (totalPontosFila > 0) {
    PontoHistorico &ult = filaMedicoes[totalPontosFila - 1];
    if ((ult.tempOk && ult.temp > 39.5) || (ult.freqOk && ult.freq > 130)) {
      Serial.println("Evento crítico detectado! Transmitindo imediatamente.");
    }
  }

  if (totalPontosFila > 0) {
    Serial.printf("\n Transmitindo telemetria (fila: %d ponto(s))...\n",
                  totalPontosFila);

    if (WiFi.status() != WL_CONNECTED) {
      WiFi.mode(WIFI_STA);
      WiFi.begin();

      unsigned long inicioWifi = millis();
      while (WiFi.status() != WL_CONNECTED && (millis() - inicioWifi < 8000)) {
        checarBotaoBoot();
        delay(200);
        Serial.print(".");
      }
    }

    if (WiFi.status() == WL_CONNECTED) {
      Serial.println(" Wi-Fi conectado");
      configTime(0, 0, "pool.ntp.org", "time.google.com");

      mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
      mqttClient.setCallback(mqttCallback);
      mqttClient.setBufferSize(8192);

      String clientId = "ESP32C6_" + device_id + "_" + String(random(0xffff), HEX);
      bool conectado = false;
      if (strlen(MQTT_USER) > 0) {
        conectado = mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS);
      } else {
        conectado = mqttClient.connect(clientId.c_str());
      }

      if (conectado) {
        String topicoConfig = "fazenda/configuracao/animal/" + device_id;
        mqttClient.subscribe(topicoConfig.c_str(), 1);

        String topicoAck = "fazenda/confirmacao/animal/" + device_id;
        mqttClient.subscribe(topicoAck.c_str(), 1);

        String pacoteJSON = gerarJSONLoteTelemetria();
        Serial.printf("Publicando MQTT lote #%u (%d bytes) em %s...\n",
                      loteAguardandoAck, pacoteJSON.length(), mqtt_topic.c_str());

        if (mqttClient.publish(mqtt_topic.c_str(), pacoteJSON.c_str())) {
          Serial.println("Transmitido no MQTT com sucesso! Aguardando ACK do servidor...");
          
          unsigned long inicioEscuta = millis();
          while (!loteConfirmadoServidor && (millis() - inicioEscuta < 2000)) {
            checarBotaoBoot();
            mqttClient.loop();
            delay(50);
          }

          if (loteConfirmadoServidor) {
            Serial.println("ACK MQTT confirmado! Fila zerada com segurança.");
          } else {
            Serial.println("Sem resposta do ACK MQTT em 2s. Fila mantida.");
          }
        } else {
          Serial.println("Falha ao publicar pacote no MQTT. Medições mantidas na fila.");
        }

        mqttClient.disconnect();
      } else {
        Serial.printf("Falha na conexão MQTT (rc=%d).\n", mqttClient.state());
      }
    } else {
      Serial.println("\nWI-FI não conectado no momento. Medições mantidas na memória.");
    }
  }

  if (!preferences.getBool("config_ok", false)) {
    Serial.println("\n Reabrindo portal cativo...");
    setupWifiManagerPortal();
    return;
  }

  // Re-le intervaloCiclo e eco_energia para aplicar imediatamente configs recebidas via MQTT neste ciclo
  intervaloCiclo = preferences.getInt("int_envio", 30);
  if (intervaloCiclo < 5) intervaloCiclo = 5;
  bool usarDeepSleep = preferences.getBool("eco_energia", false);

  if (usarDeepSleep) {
    // ============================================================================
    // Economia de Energia ATIVA - Deep Sleep para economizar bateria
    // ============================================================================
    Serial.printf("\n Modo Economia ATIVO: Entrando em sono profundo por %d segundos...\n", intervaloCiclo);
    Serial.flush();
    WiFi.disconnect(true);
    WiFi.mode(WIFI_OFF);
    esp_sleep_enable_timer_wakeup((uint64_t)intervaloCiclo * 1000000ULL);
    esp_deep_sleep_start();
  } else {
    // ============================================================================
    // Economia de Energia DESATIVADA - Processador acordado, porta COM sempre ativa!
    // ============================================================================
    Serial.printf("\n Economia DESATIVADA: Aguardando %d segundos lendo sensores em tempo real...\n", intervaloCiclo);
    Serial.flush();

    unsigned long inicioEspera = millis();
    unsigned long duracaoMs = (unsigned long)intervaloCiclo * 1000UL;
    while (millis() - inicioEspera < duracaoMs) {
      checarBotaoBoot();
      drenarFifoMax30102();
      while (Serial1.available() > 0) {
        gps.encode(Serial1.read());
      }
      delay(10);
    }
  }
}

// ==============================================================================
// Portal cativo de configuração WiFiManager
// ==============================================================================
void setupWifiManagerPortal() {
  wm.setSaveConfigCallback(saveConfigCallback);
  wm.setConfigPortalTimeout(180);
  wm.setTitle("SmartFarm IoT - Animal");
  wm.setCustomHeadElement(SMARTFARM_PORTAL_HEAD);
  std::vector<const char *> menu = {"wifi", "restart"};
  wm.setMenu(menu);

  WiFiManagerParameter custom_user_email("email", "E-mail da Conta SmartFarm (Obrigatório)", usuario_email.c_str(), 80);
  WiFiManagerParameter custom_device_id("devid", "Identificador do Animal (Obrigatório)", device_id.c_str(), 32);
  wm.addParameter(&custom_user_email);
  wm.addParameter(&custom_device_id);

  Serial.println("\n Iniciando portal cativo 'SmartFarm Animal Setup'...");
  Serial.println(" -> Conecte-se na rede Wi-Fi 'SmartFarm Animal Setup' e acesse http://192.168.4.1");
  bool conectou = wm.startConfigPortal("SmartFarm Animal Setup");

  if (!conectou) {
    Serial.println("Falha ao conectar ou tempo esgotado no portal. Reiniciando...");
    delay(3000);
    ESP.restart();
  }

  String emailDigitado = String(custom_user_email.getValue());
  emailDigitado.trim();
  emailDigitado.toLowerCase();

  String devIdDigitado = String(custom_device_id.getValue());
  devIdDigitado.trim();

  if (emailDigitado.length() > 0) {
    usuario_email = emailDigitado;
    preferences.putString("email", usuario_email);
  }

  if (devIdDigitado.length() > 0 && usuario_email.length() > 0) {
    device_id = devIdDigitado;
    preferences.putString("devid", device_id);
    preferences.putBool("config_ok", true);
    mqtt_topic = "fazenda/telemetria/animal/" + device_id;
    mqtt_ack_topic = "fazenda/confirmacao/animal/" + device_id;

    Serial.println("Configuração concluída e salva na memória flash!");
  } else if (device_id.length() == 0 || usuario_email.length() == 0) {
    Serial.println("\nERRO CRITICO O E-mail da conta e o Device ID do animal nao podem ficar em branco! Reiniciando...");
    delay(2000);
    ESP.restart();
  }

  Serial.println("Concluído! Reiniciando para entrar no ciclo de operação...");
  delay(1000);
  ESP.restart();
}

// ==============================================================================
// Leitura instantânea do botão BOOT (GPIO 9)
// ==============================================================================
void checarBotaoBoot() {
  if (digitalRead(BOTAO_CONFIG) == LOW) {
    Serial.println("\nBOTAO BOOT Pressionado!");
    Serial.println(" -> Mantenha pressionado por 3s para RESET TOTAL (limpar Wi-Fi, Conta e Device ID)");
    Serial.println(" -> Ou solte antes de 3s para abrir o portal de configuracao.");
    unsigned long inicioPress = millis();
    bool mantevePressionado = true;
    while (millis() - inicioPress < 3000) {
      if (digitalRead(BOTAO_CONFIG) == HIGH) {
        mantevePressionado = false;
        break;
      }
      delay(50);
      Serial.print(".");
    }
    Serial.println();

    if (mantevePressionado) {
      Serial.println("RESET TOTAL CONFIRMADO! Limpando NVS e Wi-Fi...");
      wm.resetSettings();
      preferences.clear();
      device_id = "";
      usuario_email = "";
      preferences.putBool("config_ok", false);
    } else {
      Serial.println("Abrindo portal cativo sob demanda...");
    }

    setupWifiManagerPortal();
  }
}

// ==============================================================================
// Inicialização do sistema (setup)
// ==============================================================================
void setup() {
  Serial.begin(115200);
  pinMode(BOTAO_CONFIG, INPUT_PULLUP);

  if (esp_reset_reason() != ESP_RST_DEEPSLEEP) {
    totalPontosFila = 0;
    contadorCiclos = 0;
  }

  for (int i = 0; i < 30; i++) {
    delay(50);
  }

  preferences.begin("smartfarm", false);
  bool ecoAtiva = preferences.getBool("eco_energia", false);

  Serial.println("\n==================================================================");
  Serial.println("  INICIANDO MODULO ANIMAL - PLATAFORMA IoT SMARTFARM");
  if (ecoAtiva) {
    Serial.println("  Economia de Energia: ATIVA");
  } else {
    Serial.println("  Economia de Energia: INATIVA");
  }
  Serial.println("==================================================================");
  device_id = preferences.getString("devid", "");
  device_id.trim();
  usuario_email = preferences.getString("email", "");
  usuario_email.trim();
  bool configOk = preferences.getBool("config_ok", false);

  Serial.println(" -> Dica: Para abrir o portal de configuracao, pressione o botao BOOT agora (com a placa ja ligada).");
  unsigned long inicioJanelaBoot = millis();
  while (millis() - inicioJanelaBoot < 2000) {
    checarBotaoBoot();
    delay(50);
  }

  if (!configOk || device_id.length() == 0 || usuario_email.length() == 0) {
    setupWifiManagerPortal();
    return;
  }

  mqtt_topic = "fazenda/telemetria/animal/" + device_id;
  mqtt_ack_topic = "fazenda/confirmacao/animal/" + device_id;
  Serial.printf(" Conta SmartFarm vinculada: %s\n", usuario_email.c_str());
  Serial.printf(" Identificador do animal ativo: %s\n", device_id.c_str());
  Serial.printf(" Topico MQTT configurado: %s\n", mqtt_topic.c_str());

  // 4. Inicializa comunicação serial com o GPS ATGM336H (9600 bps)
  Serial1.begin(9600, SERIAL_8N1, RX_PIN, TX_PIN);

  // 5. Barramento I2C compartilhado no ESP32-C6 com varredura e auto-detecção (19/20 e 20/19)
  Serial.println("Varrendo sensores no barramento I2C (testando 19/20 e 20/19)...");
  verificarBarramentoI2C();

  // 6. Inicializa sensor 1-Wire DS18B20 (Open-Drain rápido) e sensores I2C
  ds18b20ConfigurarPino();
  delay(5);
  if (ds18b20Reset()) {
    dsConectado = true;
    Serial.println(" - Sensor DS18B20: OK");
  } else {
    Serial.printf(" - Sensor DS18B20: nao detectado (nivel=%d)\n", gpio_get_level((gpio_num_t)DS18B20_PIN));
  }

  if (iniciarBMI160Direto()) {
    bmiConectado = true;
    Serial.printf(" - Sensor BMI160: OK em 0x%02X (SDA=%d, SCL=%d)\n", bmiAddr, sdaAtivo, sclAtivo);
  } else {
    Serial.println(" - Sensor BMI160: nao detectado em 0x68 nem 0x69");
  }

  if (maxSensor.begin(Wire, I2C_SPEED_STANDARD)) {
    maxConectado = true;
    configurarMax30102();
    Serial.println(" - Sensor MAX30102: OK");
  } else {
    Serial.println(" - Sensor MAX30102: nao detectado");
  }
}

// ==============================================================================
// Laço principal de execução (loop)
// ==============================================================================
void loop() {
  contadorCiclos++;

  Serial.println("\n------------------------------------------------------------------");
  Serial.println("  Modulo Animal integrado à Plataforma IoT Smartfarm");
  if (preferences.getBool("eco_energia", false)) {
    Serial.printf("  Ciclo #%d | Fila RTC: %d/%d | Deep Sleep ativo\n",
                  contadorCiclos, totalPontosFila, MAX_FILA_MEDICOES);
  } else {
    Serial.printf("  Ciclo #%d | Fila: %d/%d | Sem Deep Sleep\n",
                  contadorCiclos, totalPontosFila, MAX_FILA_MEDICOES);
  }
  Serial.println("------------------------------------------------------------------");

  checarBotaoBoot();
  coletarDadosSensores();
  enfileirarMedicaoAtual();
  processarConectividade();
}
