#include <WiFi.h>
#include <PubSubClient.h>
#include <WiFiManager.h>
#include <Preferences.h>
#include <vector>
#include <TinyGPS++.h>
#include <HardwareSerial.h>
#include "portal_ui.h"
#include "secrets.h"  

// ================= Variáveis Dinâmicas e Memória Flash (NVS) ==========
Preferences preferences;

// Sem valor padrão: o usuário é obrigado a preencher ao configurar
char device_id[32] = "";
char usuario_email[80] = "";
String mqtt_topic = "";
String mqtt_config_topic = "";
String mqtt_ack_topic = "";
String mqtt_client_id = "";
unsigned long intervaloEnvioMs = 20000; // Intervalo dinâmico de transmissão (padrão 20s)

// ================= Store-and-Forward e Confirmação de Lote (ACK) ======
struct PontoEquipamento {
  double lat;
  double lng;
  float velocidade;
  float corrente;
  int satelites;
  bool ligado;
  bool temCoordenadas;
};

#define MAX_FILA_EQUIP 50
PontoEquipamento filaEquip[MAX_FILA_EQUIP];
int totalPontosEquip = 0;
uint32_t loteEquipAtual = 0;
uint32_t loteEquipAguardando = 0;
bool loteConfirmado = false;

// Flag para saber se o usuário digitou e salvou um novo Device ID no portal
bool deveSalvarConfig = false;
void saveConfigCallback() {
  deveSalvarConfig = true;
}

// Modo Bancada: se o GPS estiver sem sinal dentro de casa, injeta coordenadas reais da fazenda
#define MODO_BANCADA false
const double BANCADA_LAT_BASE = -21.135000;
const double BANCADA_LNG_BASE = -48.971500;

WiFiClient espClient;
PubSubClient mqttClient(espClient);
WiFiManager wm;

// ================= Configurações do GPS (GY-GPS6MV2 / NEO-6M) =================
#define RXD2 16
#define TXD2 17
TinyGPSPlus gps;
// Campo 3 da sentença $GPGSV do GY-GPS6MV2: informa quantos satélites estão visíveis na antena
// mesmo enquanto o módulo ainda está sincronizando o fix ($GPGGA)
TinyGPSCustom satVisiveisGsv(gps, "GPGSV", 3);
HardwareSerial gpsSerial(2);

char linhaNmeaAtual[120] = "";
uint8_t idxNmea = 0;
char ultimaSentencaGps[120] = "(nenhuma)";
bool nmeaFixValido = false;
double nmeaLat = 0.0;
double nmeaLng = 0.0;
float nmeaVelocidadeKmh = 0.0;
int nmeaSatelitesUso = 0;
int nmeaSatelitesVisiveis = 0;

double converterNmeaParaDecimal(const char* valorStr, const char* hemisferio) {
  if (!valorStr || strlen(valorStr) < 4) return 0.0;
  double bruto = atof(valorStr);
  int graus = (int)(bruto / 100.0);
  double minutos = bruto - (graus * 100.0);
  double decimal = (double)graus + (minutos / 60.0);
  if (hemisferio && (hemisferio[0] == 'S' || hemisferio[0] == 'W')) {
    decimal = -decimal;
  }
  return decimal;
}

void obterCampoNmea(const char* sentenca, int indiceCampo, char* destino, size_t tamDestino) {
  destino[0] = '\0';
  int campoAtual = 0;
  const char* p = sentenca;
  while (*p && *p != '*') {
    if (campoAtual == indiceCampo) {
      size_t i = 0;
      while (*p && *p != ',' && *p != '*' && i < tamDestino - 1) {
        destino[i++] = *p++;
      }
      destino[i] = '\0';
      return;
    }
    if (*p == ',') campoAtual++;
    p++;
  }
}

void analisarSentencaNmea(const char* linha) {
  const char* asterisco = strchr(linha, '*');
  if (!asterisco || strlen(asterisco) < 3) return;
  uint8_t calcCrc = 0;
  for (const char* p = linha + 1; p < asterisco; p++) {
    calcCrc ^= (uint8_t)(*p);
  }
  uint8_t lidoCrc = (uint8_t)strtol(asterisco + 1, NULL, 16);
  if (calcCrc != lidoCrc) return;

  if (strlen(linha) > 6 && strncmp(linha + 3, "GGA", 3) == 0) {
    strncpy(ultimaSentencaGps, linha, sizeof(ultimaSentencaGps) - 1);
    ultimaSentencaGps[sizeof(ultimaSentencaGps) - 1] = '\0';

    char latStr[20], nsStr[4], lngStr[20], ewStr[4], fixStr[4], satStr[8];
    obterCampoNmea(linha, 2, latStr, sizeof(latStr));
    obterCampoNmea(linha, 3, nsStr, sizeof(nsStr));
    obterCampoNmea(linha, 4, lngStr, sizeof(lngStr));
    obterCampoNmea(linha, 5, ewStr, sizeof(ewStr));
    obterCampoNmea(linha, 6, fixStr, sizeof(fixStr));
    obterCampoNmea(linha, 7, satStr, sizeof(satStr));

    int fixQualidade = atoi(fixStr);
    nmeaSatelitesUso = atoi(satStr);
    if (fixQualidade > 0 && strlen(latStr) >= 4 && strlen(lngStr) >= 4) {
      double latDec = converterNmeaParaDecimal(latStr, nsStr);
      double lngDec = converterNmeaParaDecimal(lngStr, ewStr);
      if (latDec != 0.0 && lngDec != 0.0) {
        nmeaLat = latDec;
        nmeaLng = lngDec;
        nmeaFixValido = true;
      }
    }
  } else if (strlen(linha) > 6 && strncmp(linha + 3, "RMC", 3) == 0) {
    if (ultimaSentencaGps[0] == '(') {
      strncpy(ultimaSentencaGps, linha, sizeof(ultimaSentencaGps) - 1);
      ultimaSentencaGps[sizeof(ultimaSentencaGps) - 1] = '\0';
    }
    char statusStr[4], latStr[20], nsStr[4], lngStr[20], ewStr[4], knotsStr[16];
    obterCampoNmea(linha, 2, statusStr, sizeof(statusStr));
    obterCampoNmea(linha, 3, latStr, sizeof(latStr));
    obterCampoNmea(linha, 4, nsStr, sizeof(nsStr));
    obterCampoNmea(linha, 5, lngStr, sizeof(lngStr));
    obterCampoNmea(linha, 6, ewStr, sizeof(ewStr));
    obterCampoNmea(linha, 7, knotsStr, sizeof(knotsStr));

    if (statusStr[0] == 'A' && strlen(latStr) >= 4 && strlen(lngStr) >= 4) {
      double latDec = converterNmeaParaDecimal(latStr, nsStr);
      double lngDec = converterNmeaParaDecimal(lngStr, ewStr);
      if (latDec != 0.0 && lngDec != 0.0) {
        nmeaLat = latDec;
        nmeaLng = lngDec;
        nmeaFixValido = true;
      }
      if (strlen(knotsStr) > 0) {
        nmeaVelocidadeKmh = atof(knotsStr) * 1.852f;
      }
    }
  } else if (strlen(linha) > 6 && strncmp(linha + 3, "GSV", 3) == 0) {
    char satVisStr[8];
    obterCampoNmea(linha, 3, satVisStr, sizeof(satVisStr));
    int vis = atoi(satVisStr);
    if (vis >= 0) nmeaSatelitesVisiveis = vis;
  }
}

void processarByteGps(char c) {
  gps.encode(c);
  if (c == '$') {
    idxNmea = 0;
    linhaNmeaAtual[idxNmea++] = c;
  } else if (c == '\r' || c == '\n') {
    if (idxNmea > 6) {
      linhaNmeaAtual[idxNmea] = '\0';
      analisarSentencaNmea(linhaNmeaAtual);
    }
    idxNmea = 0;
  } else if (idxNmea > 0 && idxNmea < sizeof(linhaNmeaAtual) - 1) {
    linhaNmeaAtual[idxNmea++] = c;
  }
}

// ================= Botão BOOT Interno da Placa (Apenas para Reset Wi-Fi)
const int pinoBootPlaca = 0; // GPIO 0 (botão BOOT nativo do ESP32)

// ================= Configurações do HW-872 (Sensor de Corrente) =======
const int pinoCorrente = 34; // Pino conectado ao OUT do sensor
const float sensibilidade = 0.185; // 0.185 para ACS712 5A
const float tensaoZero = 2.50; 

// ================= Variável de Status Operacional =====================
bool equipamentoLigado = false; // Definido automaticamente pela corrente (> 0 = ligado, 0 = desligado)

// ================= Leitura de Corrente (RMS) ==========================
float lerCorrente() {
  unsigned int leituras = 80;
  float soma = 0;
  for (unsigned int i = 0; i < leituras; i++) {
    int adc = analogRead(pinoCorrente);
    float tensao = (adc * 3.3) / 4095.0;
    float corrente = (tensao - tensaoZero) / sensibilidade;
    soma += (corrente * corrente);
    delayMicroseconds(200);
  }
  float rms = sqrt(soma / (float)leituras);
  if (rms < 0.08) rms = 0.0; // Filtra ruído residual
  return rms;
}

// ================= Atualização dos Tópicos com o Device ID Atual ======
void atualizarTopicos() {
  mqtt_topic = "fazenda/telemetria/equipamento/" + String(device_id);
  mqtt_config_topic = "fazenda/configuracao/equipamento/" + String(device_id);
  mqtt_ack_topic = "fazenda/confirmacao/equipamento/" + String(device_id);
  mqtt_client_id = "ESP32_Equip_" + String(device_id);
}

// ================= Recepção de Feedback do Servidor via MQTT ==========
void mqttCallbackEquipamento(char* topic, byte* payload, unsigned int length) {
  char mensagem[320];
  if (length >= sizeof(mensagem)) {
    length = sizeof(mensagem) - 1;
  }
  memcpy(mensagem, payload, length);
  mensagem[length] = '\0';

  String strTopic = String(topic);
  String strPayload = String(mensagem);

  // 1. Confirmação de recebimento (ACK Downlink) do Backend
  if (strTopic.indexOf("confirmacao") >= 0) {
    if (strPayload.indexOf("\"SUCESSO\"") >= 0) {
      String buscaLoteCompacto = "\"lote_id\":" + String(loteEquipAguardando);
      String buscaLoteEspaco = "\"lote_id\": " + String(loteEquipAguardando);
      if (strPayload.indexOf(buscaLoteCompacto) >= 0 || strPayload.indexOf(buscaLoteEspaco) >= 0 || loteEquipAguardando == 0) {
        Serial.printf("\nBackend confirmou gravacao do lote #%u no MongoDB! Fila zerada (%d ponto(s) salvos).\n",
                      loteEquipAguardando, totalPontosEquip);
        totalPontosEquip = 0; // Zera a fila com 100% de garantia
        loteConfirmado = true;
      }
    }
    return;
  }

  // 2. Erros de vinculação
  if (strPayload.indexOf("CONTA_NAO_ENCONTRADA") >= 0) {
    Serial.println(F("\nA conta informada nao existe no SmartFarm!"));
    Serial.println(F("Limpando conta invalida e reiniciando para abrir o portal de configuracao..."));
    preferences.begin("equipamento", false);
    preferences.putString("usuario_email", "");
    preferences.end();
    delay(2000);
    ESP.restart();
  } else if (strPayload.indexOf("DISPOSITIVO_NAO_CADASTRADO") >= 0) {
    Serial.println(F("\n[AVISO DE VINCULACAO] Equipamento ainda nao cadastrado nesta conta no painel web."));
  }

  // 3. Configuração Remota OTA do Equipamento (Tempo de Envio)
  if (strTopic.indexOf("configuracao") >= 0) {
    Serial.printf("\nConfiguração recebida do painel web: %s\n", strPayload.c_str());

    int idxEnv = strPayload.indexOf("\"intervalo_envio_segundos\":");
    if (idxEnv >= 0) {
      int fimEnv = strPayload.indexOf(",", idxEnv);
      if (fimEnv < 0) fimEnv = strPayload.indexOf("}", idxEnv);
      if (fimEnv > idxEnv) {
        int valEnv = strPayload.substring(idxEnv + 27, fimEnv).toInt();
        if (valEnv >= 5) {
          preferences.begin("equipamento", false);
          preferences.putInt("int_envio", valEnv);
          preferences.end();
          intervaloEnvioMs = (unsigned long)valEnv * 1000UL;
          Serial.printf(" -> Intervalo de envio do equipamento atualizado para: %d segundos.\n", valEnv);
        }
      }
    }
  }
}

// ================= Configuração do Wi-Fi com WiFiManager ==============
void setupWifi(bool resetForcado = false) {
  // 1. Carrega o usuario_email e device_id salvos na memória flash NVS
  preferences.begin("equipamento", false);
  String emailSalvo = preferences.getString("usuario_email", "");
  strncpy(usuario_email, emailSalvo.c_str(), sizeof(usuario_email) - 1);
  usuario_email[sizeof(usuario_email) - 1] = '\0';

  String devIdSalvo = preferences.getString("device_id", "");
  strncpy(device_id, devIdSalvo.c_str(), sizeof(device_id) - 1);
  device_id[sizeof(device_id) - 1] = '\0';

  int segSalvo = preferences.getInt("int_envio", 20);
  if (segSalvo < 5) segSalvo = 20;
  intervaloEnvioMs = (unsigned long)segSalvo * 1000UL;

  if (strlen(device_id) > 0 && strlen(usuario_email) > 0) {
    atualizarTopicos();
    Serial.println(F("\n=============================================="));
    Serial.print(F("Conta SmartFarm vinculada: "));
    Serial.println(usuario_email);
    Serial.print(F("Device ID carregado da memoria: "));
    Serial.println(device_id);
    Serial.print(F("Topico de telemetria configurado: "));
    Serial.println(mqtt_topic);
    Serial.printf("Intervalo de transmissao MQTT: %d segundos\n", segSalvo);
    Serial.println(F("=============================================="));
  } else {
    Serial.println(F("\nConta ou Device ID nao configurados na memoria!"));
  }

  // 2. Personaliza visual, menu e campos do portal web do WiFiManager (100% offline)
  wm.setTitle("SmartFarm IoT - Equipamento");
  wm.setCustomHeadElement(SMARTFARM_PORTAL_HEAD);
  std::vector<const char *> menu = {"wifi", "restart"};
  wm.setMenu(menu);

  WiFiManagerParameter custom_user_email("usuario_email", "E-mail da Conta SmartFarm (Obrigatório)", usuario_email, 80);
  WiFiManagerParameter custom_device_id("device_id", "Identificador do Equipamento (Obrigatório)", device_id, 32);
  wm.addParameter(&custom_user_email);
  wm.addParameter(&custom_device_id);
  wm.setSaveConfigCallback(saveConfigCallback);

  // Define tempo limite de 180s para o portal de configuração
  wm.setConfigPortalTimeout(180);

  Serial.println(F("Iniciando gerenciador Wi-Fi (WiFiManager)..."));

  // Se houve reset forçado ou se o device_id/usuario_email estão vazios, força a abertura do portal
  bool conectou = false;
  if (resetForcado || strlen(device_id) == 0 || strlen(usuario_email) == 0) {
    Serial.println(F(">>> ABRINDO PORTAL CATIVO: Conecte na rede 'SmartFarm Equipamento Setup'"));
    conectou = wm.startConfigPortal("SmartFarm Equipamento Setup");
  } else {
    conectou = wm.autoConnect("SmartFarm Equipamento Setup");
  }

  if (!conectou) {
    Serial.println(F("Falha ao conectar ou tempo esgotado no portal. Reiniciando..."));
    delay(3000);
    ESP.restart();
  }

  // 3. Salva o E-mail da Conta e o Device ID digitados no portal
  String emailDigitado = String(custom_user_email.getValue());
  emailDigitado.trim();
  emailDigitado.toLowerCase();

  String devIdDigitado = String(custom_device_id.getValue());
  devIdDigitado.trim();

  if (emailDigitado.length() > 0) {
    strncpy(usuario_email, emailDigitado.c_str(), sizeof(usuario_email) - 1);
    usuario_email[sizeof(usuario_email) - 1] = '\0';
    preferences.putString("usuario_email", String(usuario_email));
  }

  if (devIdDigitado.length() > 0 && strlen(usuario_email) > 0) {
    strncpy(device_id, devIdDigitado.c_str(), sizeof(device_id) - 1);
    device_id[sizeof(device_id) - 1] = '\0';
    preferences.putString("device_id", String(device_id));
    atualizarTopicos();

    Serial.println(F("\n>>> CONFIGURACAO SALVA COM SUCESSO:"));
    Serial.print(F(">>> CONTA: "));
    Serial.println(usuario_email);
    Serial.print(F(">>> DEVICE ID: "));
    Serial.println(device_id);
    Serial.print(F(">>> TOPICO MQTT: "));
    Serial.println(mqtt_topic);
  } else if (strlen(device_id) == 0 || strlen(usuario_email) == 0) {
    // Se o usuário não preencheu, avisa e reinicia para obrigar o preenchimento
    Serial.println(F("\nO E-mail da conta e o Device ID nao podem ficar em branco! Reiniciando..."));
    delay(2000);
    ESP.restart();
  }

  Serial.println(F("WiFi Conectado com sucesso!"));
  Serial.print(F("IP do ESP32: "));
  Serial.println(WiFi.localIP());
}

// ================= Reconexão Não-Bloqueante ao Broker MQTT ============
void reconectaMQTT() {
  static unsigned long ultimaTentativaMQTT = 0;

  if (!mqttClient.connected()) {
    if (millis() - ultimaTentativaMQTT > 5000) {
      ultimaTentativaMQTT = millis();
      Serial.print(F("Tentando conectar ao Broker MQTT SmartFarm... "));
      
      bool conectado = false;
      if (strlen(MQTT_USER) > 0) {
        conectado = mqttClient.connect(mqtt_client_id.c_str(), MQTT_USER, MQTT_PASS);
      } else {
        conectado = mqttClient.connect(mqtt_client_id.c_str());
      }

      if (conectado) {
        Serial.println(F("Conectado ao MQTT com sucesso!"));
        mqttClient.subscribe(mqtt_config_topic.c_str(), 1);
        mqttClient.subscribe(mqtt_ack_topic.c_str(), 1);
        Serial.print(F("Inscrito no canal de ACK Downlink: "));
        Serial.println(mqtt_ack_topic);
      } else {
        Serial.print(F("Falhou, rc="));
        Serial.print(mqttClient.state());
        Serial.println(F(" (tentara novamente em 5s)"));
      }
    }
  }
}

void setup() {
  Serial.begin(115200);

  // Configura o botão BOOT nativo da placa (GPIO 0) caso queira resetar o Wi-Fi no boot
  pinMode(pinoBootPlaca, INPUT_PULLUP);

  // Inicia GPS
  gpsSerial.begin(9600, SERIAL_8N1, RXD2, TXD2);

  // ================= Checagem do Botão BOOT da Placa no Boot (Reset) ======
  bool resetForcado = false;
  if (digitalRead(pinoBootPlaca) == LOW) {
    Serial.println(F("\nBotao BOOT pressionado na inicializacao!"));
    Serial.println(F("Mantenha pressionado por 3 segundos para resetar e abrir o portal..."));
    
    unsigned long inicioPress = millis();
    bool mantevePressionado = true;
    while (millis() - inicioPress < 3000) {
      if (digitalRead(pinoBootPlaca) == HIGH) {
        mantevePressionado = false;
        break;
      }
      delay(50);
      Serial.print(F("."));
    }
    Serial.println();

    if (mantevePressionado) {
      Serial.println(F(">>> RESET CONFIRMADO! Limpando TODAS as credenciais e abrindo portal..."));
      wm.resetSettings(); // Limpa as credenciais Wi-Fi salvas
      preferences.begin("equipamento", false);
      preferences.clear(); // Limpa a NVS completamente (remove device_id)
      preferences.end();
      resetForcado = true;
    } else {
      Serial.println(F("Botao solto antes de 3s. Continuando inicializacao normal..."));
    }
  }

  // Conecta ao Wi-Fi dinâmico e obriga a configuração caso resetado
  setupWifi(resetForcado);

  // Configura broker MQTT com buffer ampliado para suportar lotes de telemetria Store-and-Forward
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallbackEquipamento);
  mqttClient.setBufferSize(4096);

  Serial.println(F("\nSistema de Equipamento IoT SmartFarm iniciado com sucesso!"));
  Serial.print(F("Dispositivo ativo: "));
  Serial.println(device_id);
  Serial.println(F("Status Ligado/Desligado monitorado automaticamente pelo sensor de corrente (Pino 34)."));
}

void loop() {
  // Mantém a conexão MQTT ativa
  if (WiFi.status() == WL_CONNECTED) {
    if (!mqttClient.connected()) {
      reconectaMQTT();
    } else {
      mqttClient.loop();
    }
  }

  // 1. Leitura contínua do GPS sem bloqueios
  while (gpsSerial.available() > 0) {
    processarByteGps((char)gpsSerial.read());
  }

  // 2. Captura dos dados e Publicação MQTT conforme intervalo configurado remotamente
  static unsigned long ultimoEnvio = 0;
  static uint32_t ultimoCharsGps = 0;

  if (millis() - ultimoEnvio >= intervaloEnvioMs) {
    ultimoEnvio = millis();

    // Analisa se o equipamento está ligado ou desligado com base na corrente medida:
    // se for zero (0.00 A) -> desligado; se for maior que zero -> ligado.
    float corrente = lerCorrente();
    equipamentoLigado = (corrente > 0.0f);

    Serial.printf("Corrente: %.2f A -> Status: %s\n",
                  corrente, equipamentoLigado ? "LIGADO" : "DESLIGADO");

    // Drena o buffer serial do GY-GPS6MV2 por 1s para garantir o quadro NMEA mais recente
    unsigned long inicioLeituraGps = millis();
    while (millis() - inicioLeituraGps < 1000) {
      while (gpsSerial.available() > 0) {
        processarByteGps((char)gpsSerial.read());
      }
      delay(2);
    }

    // Diagnóstico de comunicação física e sinal de satélites do GPS (GY-GPS6MV2)
    uint32_t charsAtuaisGps = gps.charsProcessed();
    bool gpsComunicando = (charsAtuaisGps > ultimoCharsGps);
    ultimoCharsGps = charsAtuaisGps;

    bool gpsFixReal = gps.location.isValid() || nmeaFixValido;
    int satelitesFix = (gps.satellites.isValid() && gps.satellites.value() > 0)
                         ? (int)gps.satellites.value()
                         : nmeaSatelitesUso;
    int satelitesVisiveis = satVisiveisGsv.isValid() ? atoi(satVisiveisGsv.value()) : nmeaSatelitesVisiveis;
    if (satelitesFix > satelitesVisiveis) satelitesVisiveis = satelitesFix;

    Serial.println(F("DIAGNOSTICO DO GPS"));
    if (!gpsComunicando) {
      Serial.println(F("Status Hardware : SEM COMUNICACAO SERIAL (verifique fios RX=16 / TX=17 e alimentacao)"));
    } else if (gpsFixReal) {
      Serial.print(F("Status Hardware : OK (Recebendo NMEA | Fix REAL com "));
      Serial.print(satelitesFix);
      Serial.print(F(" satelites | Visiveis: "));
      Serial.print(satelitesVisiveis);
      Serial.println(F(")"));
    } else {
      Serial.print(F("Status Hardware : OK (Modulo respondendo, aguardando fix | Em uso: "));
      Serial.print(satelitesFix);
      Serial.print(F(" | Visiveis no ceu: "));
      Serial.print(satelitesVisiveis);
      Serial.println(F(")"));
    }
    Serial.print(F("Bytes recebidos : "));
    Serial.print(charsAtuaisGps);
    Serial.print(F(" | Pacotes NMEA validos: "));
    Serial.println(gps.passedChecksum());
    Serial.print(F("Ultima NMEA GGA/RMC : "));
    Serial.println(ultimaSentencaGps);
    Serial.println(F("-----------------------------------------------------------------"));

    // Determina coordenadas (GPS real ou Modo Bancada)
    double lat = 0.0;
    double lng = 0.0;
    bool temCoordenadas = false;

    if (gps.location.isValid()) {
      lat = gps.location.lat();
      lng = gps.location.lng();
      temCoordenadas = true;
    } else if (nmeaFixValido) {
      lat = nmeaLat;
      lng = nmeaLng;
      temCoordenadas = true;
    } else if (MODO_BANCADA) {
      // Simula pequena variação de deslocamento se o trator estiver operando
      float variacao = equipamentoLigado ? ((rand() % 20 - 10) * 0.00001) : 0.0;
      lat = BANCADA_LAT_BASE + variacao;
      lng = BANCADA_LNG_BASE + variacao;
      temCoordenadas = true;
    }

    // Leitura ou estimativa de velocidade em km/h
    float velocidade_kmh = 0.0;
    if (gps.location.isValid() && gps.speed.isValid()) {
      velocidade_kmh = gps.speed.kmph();
    } else if (nmeaFixValido) {
      velocidade_kmh = nmeaVelocidadeKmh;
    } else if (MODO_BANCADA && equipamentoLigado) {
      velocidade_kmh = 8.5 + ((rand() % 40) / 10.0); // Simula trator em operação entre 8.5 e 12.5 km/h
    }

    // 1. Armazena a medição atual na fila em memória (Store-and-Forward)
    if (totalPontosEquip >= MAX_FILA_EQUIP) {
      // Fila circular FIFO: descarta o ponto mais antigo se a fila atingir o limite
      for (int i = 0; i < MAX_FILA_EQUIP - 1; i++) {
        filaEquip[i] = filaEquip[i + 1];
      }
      totalPontosEquip = MAX_FILA_EQUIP - 1;
    }

    filaEquip[totalPontosEquip].lat = lat;
    filaEquip[totalPontosEquip].lng = lng;
    filaEquip[totalPontosEquip].velocidade = velocidade_kmh;
    filaEquip[totalPontosEquip].corrente = corrente;
    filaEquip[totalPontosEquip].satelites = satelitesFix;
    filaEquip[totalPontosEquip].ligado = equipamentoLigado;
    filaEquip[totalPontosEquip].temCoordenadas = temCoordenadas;
    totalPontosEquip++;

    Serial.printf("Ponto registrado na fila (%d/%d pontos acumulados).\n",
                  totalPontosEquip, MAX_FILA_EQUIP);

    // 2. Se houver conexão com o Broker MQTT, monta o lote e transmite com garantia de entrega
    if (mqttClient.connected()) {
      loteEquipAtual++;
      loteEquipAguardando = loteEquipAtual;
      loteConfirmado = false;

      String jsonPayload = "{";
      jsonPayload += "\"dispositivo_id\":\"" + String(device_id) + "\",";
      jsonPayload += "\"usuario_email\":\"" + String(usuario_email) + "\",";
      jsonPayload += "\"lote_id\":" + String(loteEquipAtual) + ",";
      jsonPayload += "\"total_medicoes\":" + String(totalPontosEquip) + ",";
      jsonPayload += "\"medicoes\":[";

      for (int i = 0; i < totalPontosEquip; i++) {
        if (i > 0) jsonPayload += ",";
        jsonPayload += "{";
        jsonPayload += "\"status\":\"" + String(filaEquip[i].ligado ? "ligado" : "desligado") + "\",";
        jsonPayload += "\"velocidade\":" + String(filaEquip[i].velocidade, 1) + ",";
        jsonPayload += "\"corrente_a\":" + String(filaEquip[i].corrente, 2) + ",";
        jsonPayload += "\"satelites\":" + String(filaEquip[i].satelites) + ",";
        if (filaEquip[i].temCoordenadas) {
          jsonPayload += "\"latitude\":" + String(filaEquip[i].lat, 6) + ",";
          jsonPayload += "\"longitude\":" + String(filaEquip[i].lng, 6);
        } else {
          jsonPayload += "\"latitude\":null,";
          jsonPayload += "\"longitude\":null";
        }
        jsonPayload += "}";
      }
      jsonPayload += "]}";

      Serial.println(F("PUBLICANDO LOTE NO MQTT"));
      Serial.printf("Tamanho do pacote: %d bytes | Lote #%u com %d ponto(s)\n",
                    jsonPayload.length(), loteEquipAtual, totalPontosEquip);

      bool pubOk = mqttClient.publish(mqtt_topic.c_str(), jsonPayload.c_str());
      if (pubOk) {
        Serial.println(F("-> Pacote enviado com sucesso ao Broker MQTT!"));
        Serial.println(F("-> Aguardando confirmacao de gravacao (ACK Downlink) do Backend..."));

        // Janela de escuta para recepção do ACK
        unsigned long inicioEspera = millis();
        while (!loteConfirmado && (millis() - inicioEspera < 2500)) {
          mqttClient.loop();
          delay(50);
        }

        if (loteConfirmado) {
          Serial.println(F("-> Gravacao no MongoDB confirmada pelo Backend! Fila limpa com sucesso."));
        } else {
          Serial.println(F("-> Timeout sem ACK. Medicoes preservadas na memoria para reenvio no proximo ciclo."));
        }
      } else {
        Serial.println(F("-> Falha na publicacao MQTT. Medicoes preservadas na fila para reenvio."));
      }
    } else {
      Serial.println(F("-> MQTT offline/fora de alcance Wi-Fi. Medicoes acumuladas com seguranca na fila."));
    }
    Serial.println();
  }
}
