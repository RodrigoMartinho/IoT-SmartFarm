
#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <TinyGPSPlus.h>
#include <Adafruit_AHTX0.h>
#include <Adafruit_BMP280.h>
#include <math.h>
#include <time.h>
#include <sys/time.h>
#include <esp_system.h>
#include <Preferences.h>
#include <esp_sleep.h>
#include "driver/gpio.h"

// =====================================================
// ESTACAO AMBIENTAL - V2.6 MQTT DIRETO (CICLO 3 MIN)
// ESP32 ZY-ESP32 - MQTT direto, sem fila local; ciclo automatico de 3 min
// =====================================================

// =====================================================
// CONFIGURACAO WI-FI E MQTT
// PREENCHA ANTES DE USAR
// =====================================================

const char* WIFI_SSID = "SEU_WIFI_SSID";
const char* WIFI_SENHA = "SUA_SENHA_WIFI";

// Endereco IP ou hostname do seu broker MQTT
const char* MQTT_SERVIDOR = "SEU_BROKER_MQTT";
const uint16_t MQTT_PORTA = 1883;

// Se o broker nao exigir autenticacao, mantenha false.
const bool MQTT_USAR_LOGIN = true;
const char* MQTT_USUARIO = "SEU_USUARIO_MQTT";
const char* MQTT_SENHA = "SUA_SENHA_MQTT";

// Topico de publicacao
const char* MQTT_TOPICO = "fazenda/telemetria/ambiental/";

// Identificador deste dispositivo
const char* MQTT_CLIENT_ID = "Ambiental_01";

// Janela de rede limitada pelo ciclo ativo; protocolo MQTT/ACK ainda depende do contrato do servidor.

// Timeout das tentativas de conexao
const unsigned long TIMEOUT_WIFI = 15000UL;
const unsigned long TIMEOUT_MQTT = 5000UL;

// =====================================================
// PINOS - ESP32 ZY-ESP32
// =====================================================

#define SDA_PIN 21
#define SCL_PIN 22

#define DS18B20_PIN 4
#define RAIN_PIN 18

#define GPS_RX_PIN 16
#define GPS_TX_PIN 17

#define TEMT6000_PIN 32
#define SOIL_PIN 33
#define MQ2_PIN 34

#define BTN_DESLIGAR 13
#define BTN_AUTOMATICO 14
#define BTN_MANUAL 19

#define LED_VERMELHO 25
#define LED_VERDE 26
#define BUZZER_PIN 27

// =====================================================
// OLED
// =====================================================

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64

Adafruit_SSD1306 display(
  SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1
);

// =====================================================
// SENSORES
// =====================================================

OneWire oneWire(DS18B20_PIN);
DallasTemperature ds18b20(&oneWire);

HardwareSerial GPS_Serial(2);
TinyGPSPlus gps;

Adafruit_AHTX0 aht;
Adafruit_BMP280 bmp;

bool ahtOK = false;  // Sensor detectado na inicializacao
bool bmpOK = false;  // Sensor detectado na inicializacao
bool ultimaLeituraAHTValida = false;
bool ultimaLeituraBMPValida = false;

// =====================================================
// DADOS AMBIENTAIS
// =====================================================

float temperaturaSolo = NAN;
float temperaturaAr = NAN;
float umidadeAr = NAN;
float temperaturaBMP = NAN;
float pressao = NAN;

bool chuva = false;

int luminosidadeADC = 0;
int umidadeSoloADC = 0;
int mq2ADC = 0;
float umidadeSoloPercentual = NAN;
float luminosidadeRelativaPercentual = NAN;

// =====================================================
// MODOS DE OPERACAO
// =====================================================
// O modo sobrevive ao Light Sleep (RTC memory).
RTC_DATA_ATTR uint8_t modoRetidoRTC = 0;
RTC_DATA_ATTR uint32_t contadorDespertaresRTC = 0;

const unsigned long LIMITE_ATIVO_MS = 60000UL;
bool wakeEsperaPendente = false;
bool wakeAutomaticoPendente = false;
bool wakeManualPendente = false;
unsigned long inicioDespertarMs = 0;
RTC_DATA_ATTR uint64_t inicioCicloAutomaticoUsRTC = 0;
const uint64_t INTERVALO_COLETA_US = 180ULL * 1000000ULL;
const unsigned long ESPERA_ANTES_COLETA_MS = 10000UL;
const uint32_t DURACAO_PULSO_LED_MS = 180;


enum ModoOperacao {
  MODO_ESPERA,
  MODO_AUTOMATICO,
  MODO_MANUAL
};

ModoOperacao modoAtual = MODO_ESPERA;



int telaAtual = 0;
const int TOTAL_TELAS = 4;



// =====================================================
// GPS CACHE EM NVS E AGENDAMENTO
// =====================================================

const unsigned long TEMPO_CONVERSAO_DS18B20 = 800UL;
const unsigned long INTERVALO_GPS_POSICAO = 3600000UL;
const unsigned long INTERVALO_AJUSTE_GPS = 60000UL;

Preferences gpsPreferences;
bool gpsPreferencesOK = false;
bool horarioSincronizado = false;
String fonteHorario = "NAO SINCRONIZADO";
bool ntpConfigurado = false;
unsigned long ultimaTentativaWiFiNTP = 0;

unsigned long ultimoAjusteGPS = 0;
unsigned long ultimaAtualizacaoPosicaoGPS = 0;
bool posicaoGPSDisponivel = false;
bool posicaoGPSAntiga = true;
double latitudeGPSArmazenada = 0.0;
double longitudeGPSArmazenada = 0.0;
double altitudeGPSArmazenada = 0.0;
uint32_t satelitesGPSArmazenados = 0;
bool altitudeGPSValida = false;
bool satelitesGPSValidos = false;


struct ColetaEmAndamento {
  bool ativa = false;
  bool manual = false;
  unsigned long inicio = 0;
  float temperaturaAr = NAN;
  float umidadeAr = NAN;
  float temperaturaBMP = NAN;
  float pressao = NAN;
  bool ahtValido = false;
  bool bmpValido = false;
  int luminosidade = 0;
  int umidadeSolo = 0;
  int mq2 = 0;
  bool chuvaDetectada = false;
};

ColetaEmAndamento coletaPendente;
bool coletaManualNaFila = false;
bool dadosColetados = false; // indica se ao menos uma coleta foi concluida
bool janelaExibicaoPendente = false;
bool coletaAutomaticaPendenteWake = false;
String ultimoIDRegistro = "";
unsigned long ultimoAvisoBloqueioFinalizacao = 0;


// =====================================================
// WI-FI E MQTT
// =====================================================

WiFiClient wifiCliente;
PubSubClient mqtt(wifiCliente);

// =====================================================
// INDICADORES
// =====================================================

const unsigned long INTERVALO_LED = 500UL;
const unsigned long INTERVALO_BUZZER = 250UL;

unsigned long ultimaAlternanciaLED = 0;
unsigned long ultimaAlternanciaBuzzer = 0;

bool estadoLEDVerde = false;
bool estadoBuzzer = false;

// =====================================================
// PROTOTIPOS V2.6
// =====================================================

void atualizarRelogioGPS();
void atualizarPosicaoGPS();
bool GPSPosicaoAtualValida();
bool horarioAtualValido();
bool aguardarGPSHorarioEEstabilizacao(ModoOperacao modoSolicitado);
void iniciarColeta(bool manual);
void finalizarColeta();
void executarColeta();
String gerarIdentificador(const char* prefixo);
String criarJSONRegistro(bool manual, const String& idRegistro);
String obterDataHoraLocal();
void restaurarPosicaoGPS();
void salvarPosicaoGPS();
void prepararBotoesAposWakeGPIO();
void executarJanelaExibicao();

// =====================================================
// BOTOES COM ANTIRREBOTE
// =====================================================

const unsigned long DEBOUNCE_MS = 40;

struct Botao {
  uint8_t pino;
  bool leituraAnterior;
  bool estadoEstavel;
  unsigned long ultimaMudanca;
};

Botao botaoEspera = {
  BTN_DESLIGAR, HIGH, HIGH, 0
};

Botao botaoAutomatico = {
  BTN_AUTOMATICO, HIGH, HIGH, 0
};

Botao botaoManual = {
  BTN_MANUAL, HIGH, HIGH, 0
};

void configurarBotao(Botao &b) {
  pinMode(b.pino, INPUT_PULLUP);
  b.leituraAnterior = digitalRead(b.pino);
  b.estadoEstavel = b.leituraAnterior;
  b.ultimaMudanca = millis();
}

bool botaoPressionado(Botao &b) {
  bool leitura = digitalRead(b.pino);
  unsigned long agora = millis();

  if (leitura != b.leituraAnterior) {
    b.leituraAnterior = leitura;
    b.ultimaMudanca = agora;
  }

  if (agora - b.ultimaMudanca >= DEBOUNCE_MS) {
    if (leitura != b.estadoEstavel) {
      b.estadoEstavel = leitura;

      if (b.estadoEstavel == LOW) {
        return true;
      }
    }
  }

  return false;
}

// =====================================================
// UTILITARIO PARA JSON
// =====================================================


String numeroJSON(float valor, uint8_t casas = 2) {
  if (isnan(valor) || isinf(valor)) {
    return String("null");
  }

  return String((double)valor, (unsigned int)casas);
}


const char* textoModo() {
  switch (modoAtual) {
    case MODO_ESPERA:
      return "ESPERA";

    case MODO_AUTOMATICO:
      return "AUTOMATICO";

    case MODO_MANUAL:
      return "MANUAL";
  }

  return "DESCONHECIDO";
}

// =====================================================
// INDICADORES DE BATERIA
// =====================================================

void atualizarIndicadoresBateria() {
  // Alerta vermelho e buzzer aguardam a medicao real da bateria.
  // Nao utilizar o percentual simulado para gerar alertas.
  digitalWrite(LED_VERMELHO, LOW);
  digitalWrite(BUZZER_PIN, LOW);
}

// =====================================================
// CONEXAO WI-FI
// =====================================================

bool conectarWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return true;
  }

  Serial.println("[WiFi] Conectando...");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_SENHA);

  unsigned long inicio = millis();

  while (WiFi.status() != WL_CONNECTED &&
         millis() - inicio < TIMEOUT_WIFI) {
    atualizarIndicadoresBateria();

    // Mantem o GPS sendo lido durante a tentativa.
    while (GPS_Serial.available()) {
      gps.encode(GPS_Serial.read());
    }

    delay(10);
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[WiFi] Conectado. IP: ");
    Serial.println(WiFi.localIP());
    return true;
  }

  Serial.println("[WiFi] Falha na conexao.");
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);

  return false;
}

// =====================================================
// CONEXAO MQTT
// =====================================================

bool conectarMQTT() {
  if (mqtt.connected()) {
    return true;
  }

  Serial.println("[MQTT] Conectando ao broker...");

  unsigned long inicio = millis();

  while (millis() - inicio < TIMEOUT_MQTT) {
    bool conectado;

    if (MQTT_USAR_LOGIN) {
      conectado = mqtt.connect(
        MQTT_CLIENT_ID,
        MQTT_USUARIO,
        MQTT_SENHA
      );
    } else {
      conectado = mqtt.connect(MQTT_CLIENT_ID);
    }

    if (conectado) {
      Serial.println("[MQTT] Conectado.");
      return true;
    }

    Serial.print("[MQTT] Falha, estado: ");
    Serial.println(mqtt.state());

    delay(250);
  }

  return false;
}

bool publicarPayloadMQTT(const String& payload) {
  if (String(WIFI_SSID).length() == 0 ||
      String(MQTT_SERVIDOR).length() == 0 ||
      (MQTT_USAR_LOGIN &&
       (String(MQTT_USUARIO).length() == 0 ||
        String(MQTT_SENHA).length() == 0))) {
    Serial.println("[MQTT] CONFIGURACAO INCOMPLETA: preencha Wi-Fi, broker e credenciais.");
    return false;
  }

  Serial.println("[MQTT] Iniciando transmissao da medicao...");
  if (!conectarWiFi()) {
    Serial.println("[MQTT] FALHA: Wi-Fi indisponivel. Esta medicao nao sera armazenada.");
    return false;
  }

  if (!conectarMQTT()) {
    Serial.println("[MQTT] FALHA: broker indisponivel. Esta medicao nao sera armazenada.");
    WiFi.disconnect(true);
    WiFi.mode(WIFI_OFF);
    return false;
  }

  Serial.printf("[MQTT] Tamanho do payload: %u bytes; buffer: %u bytes; conectado=%s\\n",
    (unsigned)payload.length(),
    (unsigned)mqtt.getBufferSize(),
    mqtt.connected() ? "SIM" : "NAO");

  bool enviado = mqtt.publish(MQTT_TOPICO, payload.c_str(), false);
  if (enviado) {
    Serial.println("[MQTT] PUBLICACAO ACEITA pelo cliente MQTT/broker.");
    Serial.println("[MQTT] Payload:");
    Serial.println(payload);
  } else {
    Serial.print("[MQTT] FALHA ao publicar. Estado PubSubClient: ");
    Serial.println(mqtt.state());
    Serial.println("[MQTT] Estado 0 significa que a conexao continua ativa; verifique tamanho do pacote/buffer.");
  }

  mqtt.disconnect();
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  Serial.println("[WiFi] Desligado apos tentativa de transmissao.");

  return enviado;
}

// =====================================================
// LIGHT SLEEP - V2.6
// GPIO13, GPIO14 e GPIO19 acordam por nivel LOW.
// Compativel com ESP32-WROOM-32 e Arduino-ESP32 3.3.7.
// =====================================================

void prepararWakeupLightSleep() {
  // Os tres botoes ja estao configurados como INPUT_PULLUP no setup().
  // GPIO wakeup em Light Sleep aceita GPIOs digitais comuns.
  gpio_wakeup_enable((gpio_num_t)BTN_DESLIGAR, GPIO_INTR_LOW_LEVEL);
  gpio_wakeup_enable((gpio_num_t)BTN_AUTOMATICO, GPIO_INTR_LOW_LEVEL);
  gpio_wakeup_enable((gpio_num_t)BTN_MANUAL, GPIO_INTR_LOW_LEVEL);
  esp_sleep_enable_gpio_wakeup();

  // No modo automatico, acorda no proximo inicio de coleta (intervalo de 3 min).
  // Nos demais modos, permanece em Light Sleep ate um dos botoes ser pressionado.
  if (modoAtual == MODO_AUTOMATICO) {
    esp_sleep_enable_timer_wakeup(calcularProximoDespertarUs());
  } else {
    esp_sleep_disable_wakeup_source(ESP_SLEEP_WAKEUP_TIMER);
  }
}

// Ao acordar por GPIO, prepara o antirrebote para que o botao
// ainda pressionado seja reconhecido por processarBotoes().
void prepararBotoesAposWakeGPIO() {
  delay(DEBOUNCE_MS + 10);

  Botao* botoes[] = { &botaoEspera, &botaoAutomatico, &botaoManual };

  for (Botao* b : botoes) {
    if (digitalRead(b->pino) == LOW) {
      b->leituraAnterior = HIGH;
      b->estadoEstavel = HIGH;
      b->ultimaMudanca = millis() - DEBOUNCE_MS - 1;
    }
  }
}

void aguardarSoltarBotoesWake() {
  // Evita ciclo de wake imediato enquanto um botao permanece pressionado.
  while (digitalRead(BTN_DESLIGAR) == LOW ||
         digitalRead(BTN_AUTOMATICO) == LOW ||
         digitalRead(BTN_MANUAL) == LOW) {
    delay(10);
  }
  delay(DEBOUNCE_MS);
}

void entrarLightSleep() {
  Serial.println("[SLEEP] Entrando em Light Sleep; botoes ativos e timer no modo automatico.");
  Serial.flush();

  if (mqtt.connected()) mqtt.disconnect();
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);

  digitalWrite(LED_VERMELHO, LOW);
  digitalWrite(LED_VERDE, LOW);
  digitalWrite(BUZZER_PIN, LOW);
  display.ssd1306_command(SSD1306_DISPLAYOFF);

  // Nunca dormir com o botao ainda pressionado: isso causaria wake repetido.
  aguardarSoltarBotoesWake();

  prepararWakeupLightSleep();
  esp_err_t resultado = esp_light_sleep_start();

  // A execucao continua aqui depois do despertar.
  if (resultado != ESP_OK) {
    Serial.printf("[SLEEP] Falha ao entrar em Light Sleep: %d\n", (int)resultado);
    delay(100);
    return;
  }

  esp_sleep_wakeup_cause_t causa = esp_sleep_get_wakeup_cause();

  if (causa == ESP_SLEEP_WAKEUP_TIMER) {
    Serial.println("[WAKE] Temporizador: inicio do novo ciclo automatico.");
    inicioDespertarMs = millis();
    inicioCicloAutomaticoUsRTC = (uint64_t)esp_timer_get_time();
    coletaAutomaticaPendenteWake = (modoAtual == MODO_AUTOMATICO);
  } else if (causa == ESP_SLEEP_WAKEUP_GPIO) {
    // Captura imediata: o usuario pode soltar o botao antes do loop/GPS.
    wakeEsperaPendente = (digitalRead(BTN_DESLIGAR) == LOW);
    wakeAutomaticoPendente = (digitalRead(BTN_AUTOMATICO) == LOW);
    wakeManualPendente = (digitalRead(BTN_MANUAL) == LOW);
    Serial.printf("[WAKE] GPIO: espera=%d automatico=%d manual=%d\n",
      wakeEsperaPendente, wakeAutomaticoPendente, wakeManualPendente);
    inicioDespertarMs = millis();
    prepararBotoesAposWakeGPIO();
  } else {
    Serial.printf("[WAKE] Causa de despertar: %d\n", (int)causa);
  }
}

// =====================================================
// VALIDACAO OBRIGATORIA DE GPS E HORARIO
// O firmware nao coleta, transmite nem dorme enquanto faltar
// uma posicao GPS atual ou um horario valido.
// =====================================================

bool GPSPosicaoAtualValida() {
  return gps.location.isValid() && gps.location.age() < 10000;
}

bool horarioAtualValido() {
  return time(nullptr) >= 1700000000;
}

bool aguardarGPSHorarioEEstabilizacao(ModoOperacao modoSolicitado) {
  const unsigned long ESTABILIZACAO_MS = ESPERA_ANTES_COLETA_MS;
  unsigned long inicioEstabilizacao = 0;
  unsigned long ultimoAviso = 0;

  Serial.println("[VALIDACAO] Aguardando GPS atual e horario sincronizado.");
  Serial.println("[VALIDACAO] Sem os dois requisitos, nao havera coleta, MQTT ou Light Sleep.");

  while (modoAtual == modoSolicitado) {
    processarBotoes();

    // Alimenta continuamente o receptor GPS.
    while (GPS_Serial.available()) {
      gps.encode(GPS_Serial.read());
    }

    atualizarRelogioGPS();
    atualizarPosicaoGPS();

    // Se o horario ainda nao estiver valido, tenta sincronizar por NTP.
    // O Wi-Fi permanece ligado apos conectar; a publicacao MQTT podera
    // reutilizar a conexao. Se nao houver rede, o GPS ainda pode fornecer hora.
    if (!horarioAtualValido()) {
      horarioSincronizado = false;
      if (WiFi.status() != WL_CONNECTED &&
          (ultimaTentativaWiFiNTP == 0 ||
           millis() - ultimaTentativaWiFiNTP >= TIMEOUT_WIFI + 1000UL)) {
        ultimaTentativaWiFiNTP = millis();
        if (!conectarWiFi()) {
          ntpConfigurado = false;
        }
      }

      if (WiFi.status() == WL_CONNECTED && !ntpConfigurado) {
        Serial.println("[NTP] Solicitando sincronizacao de horario pela internet...");
        configTime(0, 0, "pool.ntp.org", "time.google.com", "time.nist.gov");
        ntpConfigurado = true;
      }
    } else {
      if (!horarioSincronizado) {
        horarioSincronizado = true;
        if (fonteHorario == "NAO SINCRONIZADO") {
          fonteHorario = (WiFi.status() == WL_CONNECTED) ? "NTP" : "RELOGIO_RETIDO";
        }
      }
    }

    bool gpsOK = GPSPosicaoAtualValida();
    bool horaOK = horarioAtualValido();

    if (gpsOK && horaOK) {
      if (inicioEstabilizacao == 0) {
        inicioEstabilizacao = millis();
        Serial.println("[VALIDACAO] GPS atual e horario validos. Iniciando estabilizacao de 10 s.");
      }

      if (millis() - inicioEstabilizacao >= ESTABILIZACAO_MS) {
        // Confere novamente no final da janela, antes de autorizar a coleta.
        while (GPS_Serial.available()) {
          gps.encode(GPS_Serial.read());
        }
        atualizarRelogioGPS();
        atualizarPosicaoGPS();

        if (GPSPosicaoAtualValida() && horarioAtualValido()) {
          Serial.println("[VALIDACAO] GPS e horario confirmados. Liberando coleta.");
          return true;
        }

        inicioEstabilizacao = 0;
        Serial.println("[VALIDACAO] GPS perdeu validade durante a estabilizacao; reiniciando espera.");
      }
    } else {
      if (inicioEstabilizacao != 0) {
        inicioEstabilizacao = 0;
        Serial.println("[VALIDACAO] Um requisito foi perdido; reiniciando estabilizacao.");
      }

      if (millis() - ultimoAviso >= 5000UL) {
        ultimoAviso = millis();
        Serial.printf("[VALIDACAO] Aguardando: GPS=%s | horario=%s | fonte=%s | satelites=",
          gpsOK ? "OK" : "SEM FIX ATUAL",
          horaOK ? "OK" : "NAO SINCRONIZADO",
          fonteHorario.c_str());
        if (gps.satellites.isValid()) Serial.println(gps.satellites.value());
        else Serial.println("indisponivel");
      }
    }

    atualizarIndicadoresBateria();
    delay(10);
  }

  Serial.println("[VALIDACAO] Espera cancelada por mudanca de modo.");
  return false;
}

// =====================================================
// INICIALIZACAO
// =====================================================

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println();
  Serial.println("ESTACAO AMBIENTAL - V2.6 CALIBRACAO");
  inicioDespertarMs = millis();
  if (inicioCicloAutomaticoUsRTC == 0) inicioCicloAutomaticoUsRTC = (uint64_t)esp_timer_get_time();
  modoAtual = (ModoOperacao)modoRetidoRTC;
  Serial.print("[BOOT] Modo restaurado: ");
  Serial.println(textoModo());

  pinMode(LED_VERMELHO, OUTPUT);
  pinMode(LED_VERDE, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  digitalWrite(LED_VERMELHO, LOW);
  digitalWrite(LED_VERDE, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  WiFi.mode(WIFI_OFF);

  mqtt.setServer(MQTT_SERVIDOR, MQTT_PORTA);
  // O JSON ambiental pode ultrapassar o buffer padrao da PubSubClient.
  // Nao reduzir depois: a segunda chamada sobrescrevia os 2048 bytes.
  if (!mqtt.setBufferSize(2048)) {
    Serial.println("[MQTT] AVISO: nao foi possivel reservar buffer de 2048 bytes.");
  }
  mqtt.setKeepAlive(15);
  mqtt.setSocketTimeout(3);

  Wire.begin(SDA_PIN, SCL_PIN);

  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("ERRO: OLED nao encontrado!");

    while (true) {
      digitalWrite(LED_VERDE, LOW);
      delay(1000);
    }
  }

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("ESTACAO AMBIENTAL");
  display.println();
  display.println("Inicializando V2.6");
  display.println("MQTT direto");
  display.display();

  configurarBotao(botaoEspera);
  configurarBotao(botaoAutomatico);
  configurarBotao(botaoManual);

  ds18b20.begin();
  // Conversao assíncrona: o loop continua atendendo botoes, GPS e OLED.
  ds18b20.setWaitForConversion(false);
  pinMode(RAIN_PIN, INPUT);

  // Mantem UTC0 conforme configuracao validada anteriormente.
  setenv("TZ", "UTC0", 1);
  tzset();

  // Se o RTC interno ainda conservar um horario valido (reinicializacao
  // sem perda total de energia), ele pode ser usado como referencia.
  if (time(nullptr) >= 1700000000) {
    horarioSincronizado = true;
    fonteHorario = "RELOGIO_RETIDO";
  }

  // Sem armazenamento local nem fila de reenvio.
  // A ultima posicao GPS continua podendo ser guardada em NVS (Preferences).
  gpsPreferencesOK = gpsPreferences.begin("gpscache", false);
  if (gpsPreferencesOK) {
    restaurarPosicaoGPS();
    Serial.println("[NVS] Cache GPS disponivel.");
  } else {
    Serial.println("[NVS] Cache GPS indisponivel; funcionamento continua.");
  }

  analogReadResolution(12);
  pinMode(TEMT6000_PIN, INPUT);
  pinMode(SOIL_PIN, INPUT);
  pinMode(MQ2_PIN, INPUT);

  GPS_Serial.begin(
    9600, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN
  );

  ahtOK = aht.begin(&Wire);

  if (bmp.begin(0x76)) {
    bmpOK = true;
  } else if (bmp.begin(0x77)) {
    bmpOK = true;
  }

  if (bmpOK) {
    bmp.setSampling(
      Adafruit_BMP280::MODE_NORMAL,
      Adafruit_BMP280::SAMPLING_X2,
      Adafruit_BMP280::SAMPLING_X16,
      Adafruit_BMP280::FILTER_X16,
      Adafruit_BMP280::STANDBY_MS_500
    );
  }

  Serial.print("AHT20: ");
  Serial.println(ahtOK ? "OK" : "ERRO");

  Serial.print("BMP280: ");
  Serial.println(bmpOK ? "OK" : "ERRO");

  Serial.print("MQTT broker: ");
  Serial.println(MQTT_SERVIDOR);

  Serial.print("MQTT porta: ");
  Serial.println(MQTT_PORTA);

  Serial.println("Modo inicial: ESPERA");
  Serial.println("Pressione azul para iniciar.");

  atualizarIndicadoresBateria();
  atualizarOLED();
}

// =====================================================
// LOOP PRINCIPAL - V2.6
// =====================================================

void loop() {
  processarBotoes();
  modoRetidoRTC = (uint8_t)modoAtual;

  while (true) {
    processarBotoes();
    modoRetidoRTC = (uint8_t)modoAtual;

    if (modoAtual == MODO_ESPERA) {
      coletaManualNaFila = false;
      coletaAutomaticaPendenteWake = false;
      break;
    }

    uint64_t agoraCicloUs = (uint64_t)esp_timer_get_time();
    bool coletaAutomaticaDevida =
      (modoAtual == MODO_AUTOMATICO &&
       (coletaAutomaticaPendenteWake ||
        agoraCicloUs - inicioCicloAutomaticoUsRTC >= INTERVALO_COLETA_US));

    bool coletaManualDevida =
      (modoAtual == MODO_MANUAL && coletaManualNaFila);

    if (coletaAutomaticaDevida || coletaManualDevida) {
      ModoOperacao modoSolicitado = coletaAutomaticaDevida
        ? MODO_AUTOMATICO : MODO_MANUAL;

      if (coletaAutomaticaDevida) {
        coletaAutomaticaPendenteWake = false;
        // O intervalo de 180 s continua contado a partir do despertar.
        inicioCicloAutomaticoUsRTC = (uint64_t)esp_timer_get_time();
      }

      // Esta funcao espera indefinidamente pelos dois requisitos e,
      // somente depois, executa a estabilizacao de 10 segundos.
      if (!aguardarGPSHorarioEEstabilizacao(modoSolicitado)) {
        continue;
      }

      if (modoSolicitado == MODO_AUTOMATICO) {
        if (modoAtual != MODO_AUTOMATICO) continue;
        executarColeta();
      } else {
        if (modoAtual != MODO_MANUAL || !coletaManualNaFila) continue;
        coletaManualNaFila = false;
        iniciarColeta(true);
      }

      // Conclui a coleta sem interromper a leitura do GPS.
      while (coletaPendente.ativa) {
        while (GPS_Serial.available()) gps.encode(GPS_Serial.read());
        atualizarRelogioGPS();
        atualizarPosicaoGPS();

        if (millis() - coletaPendente.inicio >= TEMPO_CONVERSAO_DS18B20) {
          finalizarColeta();
        }

        processarBotoes();
        delay(5);
      }

      if (janelaExibicaoPendente) {
        janelaExibicaoPendente = false;
        executarJanelaExibicao();
      }

      // Volta ao início para processar solicitações de botão feitas
      // durante a coleta ou a janela do OLED.
      continue;
    }

    if (janelaExibicaoPendente) {
      janelaExibicaoPendente = false;
      executarJanelaExibicao();
      continue;
    }

    break;
  }

  atualizarIndicadoresBateria();

  if (!dadosColetados) {
    display.ssd1306_command(SSD1306_DISPLAYON);
    atualizarOLED();
  }

  Serial.println("[SLEEP] Tarefas concluidas; entrando em repouso.");
  entrarLightSleep();
}

// =====================================================
// BOTOES E TRANSICOES DE MODO
// =====================================================

void processarBotoes() {
  bool eventoEspera = wakeEsperaPendente;
  bool eventoAutomatico = wakeAutomaticoPendente;
  bool eventoManual = wakeManualPendente;
  wakeEsperaPendente = false;
  wakeAutomaticoPendente = false;
  wakeManualPendente = false;

  if (eventoEspera || botaoPressionado(botaoEspera)) {
    modoAtual = MODO_ESPERA;
    modoRetidoRTC = MODO_ESPERA;
    coletaManualNaFila = false;
    coletaAutomaticaPendenteWake = false;
    // Nao apagar nem limpar registros pendentes.
    Serial.println("[MODO] ESPERA - modo atualizado.");
    atualizarOLED();
  }

  if (eventoAutomatico || botaoPressionado(botaoAutomatico)) {
    modoAtual = MODO_AUTOMATICO;
    modoRetidoRTC = MODO_AUTOMATICO;
    coletaManualNaFila = false;
    inicioCicloAutomaticoUsRTC =
      (uint64_t)esp_timer_get_time() - INTERVALO_COLETA_US;
    Serial.println("[MODO] AUTOMATICO - coleta apos espera de 10 s; ciclo de 3 minutos.");
    atualizarOLED();
  }

  if (eventoManual || botaoPressionado(botaoManual)) {
    modoAtual = MODO_MANUAL;
    modoRetidoRTC = MODO_MANUAL;
    Serial.println("[MODO] MANUAL - coleta aguardara GPS atual e horario valido.");
    coletaManualNaFila = true;
    atualizarOLED();
  }
}

// =====================================================
// CALIBRACAO ANALOGICA V2.6
// Solo: ADC 3150 seco=0%; ADC 1500 molhado=100%.
// TEMT6000: percentual relativo do ADC, nao representa lux.
// =====================================================
float converterUmidadeSoloPercentual(int adc) {
  float pct = (3150.0f - (float)adc) * 100.0f / (3150.0f - 1500.0f);
  return constrain(pct, 0.0f, 100.0f);
}

float converterLuminosidadeRelativa(int adc) {
  float pct = ((float)adc / 4095.0f) * 100.0f;
  return constrain(pct, 0.0f, 100.0f);
}

uint64_t calcularProximoDespertarUs() {
  uint64_t agoraUs = (uint64_t)esp_timer_get_time();
  uint64_t alvoColeta = inicioCicloAutomaticoUsRTC + INTERVALO_COLETA_US;

  // Se o processamento/transmissao ultrapassar os 180 s, acorda em seguida.
  return (alvoColeta > agoraUs) ? (alvoColeta - agoraUs) : 100000ULL;
}

// =====================================================
// JANELA DE EXIBICAO APOS A TRANSMISSAO
// 20 segundos no total: 4 telas x 5 segundos.
// LED verde pulsa a cada 3 segundos durante esta janela.
// =====================================================

void executarJanelaExibicao() {
  const unsigned long DURACAO_JANELA_MS = 20000UL;
  const unsigned long INTERVALO_TELA_MS = 5000UL;
  const unsigned long INTERVALO_LED_MS = 3000UL;

  unsigned long inicio = millis();
  unsigned long proximaTela = inicio + INTERVALO_TELA_MS;
  unsigned long proximoPulso = inicio + INTERVALO_LED_MS;
  unsigned long desligarLED = 0;

  telaAtual = 0;
  digitalWrite(LED_VERDE, LOW);
  display.ssd1306_command(SSD1306_DISPLAYON);
  atualizarOLED();

  Serial.println("[OLED] Exibicao por 20 s: quatro telas, 5 s cada.");
  Serial.println("[LED] Pulso verde a cada 3 s durante a exibicao.");

  while (millis() - inicio < DURACAO_JANELA_MS) {
    unsigned long agora = millis();

    // Mantem os botoes responsivos enquanto o visor esta ativo.
    processarBotoes();

    // Se o botao manual iniciou outra coleta, interrompe a exibicao
    // para concluir essa coleta antes de iniciar uma nova janela de telas.
    if (coletaPendente.ativa) {
      break;
    }

    if ((long)(agora - proximaTela) >= 0) {
      telaAtual = (telaAtual + 1) % TOTAL_TELAS;
      atualizarOLED();
      proximaTela += INTERVALO_TELA_MS;
    }

    if ((long)(agora - proximoPulso) >= 0) {
      digitalWrite(LED_VERDE, HIGH);
      desligarLED = agora + DURACAO_PULSO_LED_MS;
      proximoPulso += INTERVALO_LED_MS;
    }

    if (desligarLED != 0 && (long)(agora - desligarLED) >= 0) {
      digitalWrite(LED_VERDE, LOW);
      desligarLED = 0;
    }

    delay(5);
  }

  digitalWrite(LED_VERDE, LOW);
  display.ssd1306_command(SSD1306_DISPLAYOFF);
  Serial.println("[OLED] Janela de exibicao encerrada.");
}

// =====================================================
// COLETA DOS SENSORES - ASSINCRONA
// =====================================================

void executarColeta() {
  iniciarColeta(false);
}

void iniciarColeta(bool manual) {
  if (coletaPendente.ativa) {
    if (manual) coletaManualNaFila = true;
    return;
  }

  Serial.println();
  Serial.println(manual ? "=== INICIO DA COLETA MANUAL ==="
                        : "=== INICIO DA COLETA AUTOMATICA ===");

  coletaPendente.ativa = true;
  coletaPendente.manual = manual;
  coletaPendente.inicio = millis();

  // Dispara a conversao sem bloquear o processador.
  ds18b20.requestTemperatures();

  chuva = (digitalRead(RAIN_PIN) == LOW);
  coletaPendente.chuvaDetectada = chuva;

  coletaPendente.ahtValido = false;
  coletaPendente.bmpValido = false;
  coletaPendente.temperaturaAr = NAN;
  coletaPendente.umidadeAr = NAN;
  coletaPendente.temperaturaBMP = NAN;
  coletaPendente.pressao = NAN;

  if (ahtOK) {
    sensors_event_t humidity;
    sensors_event_t temperature;
    aht.getEvent(&humidity, &temperature);

    if (isfinite(temperature.temperature) &&
        isfinite(humidity.relative_humidity)) {
      coletaPendente.temperaturaAr = temperature.temperature;
      coletaPendente.umidadeAr = humidity.relative_humidity;
      coletaPendente.ahtValido = true;
    }
  }

  if (bmpOK) {
    float t = bmp.readTemperature();
    float p = bmp.readPressure() / 100.0F;
    if (isfinite(t) && isfinite(p) && p > 0.0F) {
      coletaPendente.temperaturaBMP = t;
      coletaPendente.pressao = p;
      coletaPendente.bmpValido = true;
    }
  }

  coletaPendente.luminosidade = analogRead(TEMT6000_PIN);
  coletaPendente.umidadeSolo = analogRead(SOIL_PIN);
  coletaPendente.mq2 = analogRead(MQ2_PIN);
  luminosidadeRelativaPercentual = converterLuminosidadeRelativa(coletaPendente.luminosidade);
  umidadeSoloPercentual = converterUmidadeSoloPercentual(coletaPendente.umidadeSolo);

  temperaturaAr = coletaPendente.temperaturaAr;
  umidadeAr = coletaPendente.umidadeAr;
  temperaturaBMP = coletaPendente.temperaturaBMP;
  pressao = coletaPendente.pressao;
  luminosidadeADC = coletaPendente.luminosidade;
  umidadeSoloADC = coletaPendente.umidadeSolo;
  mq2ADC = coletaPendente.mq2;
}

void finalizarColeta() {
  // Protecao final: se o fix atual ou o horario tiverem sido perdidos
  // durante a leitura dos sensores, mantem a coleta pendente e nao publica.
  if (!GPSPosicaoAtualValida() || !horarioAtualValido()) {
    if (millis() - ultimoAvisoBloqueioFinalizacao >= 5000UL) {
      ultimoAvisoBloqueioFinalizacao = millis();
      Serial.println("[VALIDACAO] Publicacao bloqueada: aguardando GPS atual e horario valido.");
    }
    return;
  }

  coletaPendente.ativa = false;
  dadosColetados = true;

  temperaturaSolo = ds18b20.getTempCByIndex(0);
  if (temperaturaSolo == DEVICE_DISCONNECTED_C ||
      !isfinite(temperaturaSolo) ||
      temperaturaSolo < -55.0 || temperaturaSolo > 125.0) {
    temperaturaSolo = NAN;
  }

  // ahtOK/bmpOK indicam presenca fisica; nao os derrubamos por uma
  // leitura pontualmente invalida. As flags abaixo representam esta amostra.
  ultimaLeituraAHTValida = coletaPendente.ahtValido;
  ultimaLeituraBMPValida = coletaPendente.bmpValido;
  chuva = coletaPendente.chuvaDetectada;

  bool manual = coletaPendente.manual;
  String idRegistro = gerarIdentificador("R");
  String json = criarJSONRegistro(manual, idRegistro);

  // Sem armazenamento local: cada amostra e enviada imediatamente.

  imprimirSerial();
  Serial.println("[MQTT] ID do registro: " + idRegistro);
  publicarPayloadMQTT(json);
  janelaExibicaoPendente = true;

  Serial.println(manual ? "=== FIM DA COLETA MANUAL ==="
                        : "=== FIM DA COLETA AUTOMATICA ===");

}

String gerarIdentificador(const char* prefixo) {
  char buffer[40];
  uint32_t a = (uint32_t)esp_random();
  uint32_t b = (uint32_t)esp_random();
  snprintf(buffer, sizeof(buffer), "%s-%08lX%08lX",
           prefixo, (unsigned long)a, (unsigned long)b);
  return String(buffer);
}

String obterDataHoraLocal() {
  time_t agora = time(nullptr);
  if (agora < 1700000000) return String("null");

  struct tm info;
  if (!localtime_r(&agora, &info)) return String("null");

  char buffer[24];
  if (strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%S", &info) == 0) {
    return String("null");
  }
  return String("\"") + buffer + "\"";
}

String criarJSONRegistro(bool manual, const String& idRegistro) {
  String json;
  json.reserve(1000);

  json = "{";
  json += "\"dispositivo_id\":\"Ambiental_01\",";
  json += "\"usuario_email\":\"usuario@exemplo.com\",";
  json += "\"versao\":\"2.6\",";
  json += "\"tipo\":\"";
  json += manual ? "manual" : "automatico";
  json += "\",";
  json += "\"data_hora\":";
  json += obterDataHoraLocal();
  json += ",";
  json += "\"horario_sincronizado\":";
  json += (time(nullptr) >= 1700000000) ? "true" : "false";
  json += ",";
  json += "\"fonte_horario\":\"";
  json += fonteHorario;
  json += "\",";

  json += "\"temperatura_solo_C\":";
  json += numeroJSON(temperaturaSolo);
  json += ",";
  json += "\"temperatura_ar_C\":";
  json += coletaPendente.ahtValido ? numeroJSON(coletaPendente.temperaturaAr) : "null";
  json += ",";
  json += "\"umidade_ar_percentual\":";
  json += coletaPendente.ahtValido ? numeroJSON(coletaPendente.umidadeAr) : "null";
  json += ",";
  json += "\"temperatura_bmp_C\":";
  json += coletaPendente.bmpValido ? numeroJSON(coletaPendente.temperaturaBMP) : "null";
  json += ",";
  json += "\"pressao_hPa\":";
  json += coletaPendente.bmpValido ? numeroJSON(coletaPendente.pressao) : "null";
  json += ",";
  json += "\"chuva\":";
  json += coletaPendente.chuvaDetectada ? "true" : "false";
  json += ",";
  json += "\"luminosidade_adc\":" + String(coletaPendente.luminosidade) + ",";
  json += "\"luminosidade_relativa_percentual\":" + numeroJSON(luminosidadeRelativaPercentual, 1) + ",";
  json += "\"umidade_solo_adc\":" + String(coletaPendente.umidadeSolo) + ",";
  json += "\"umidade_solo_percentual\":" + numeroJSON(umidadeSoloPercentual, 1) + ",";
  json += "\"mq2_adc\":" + String(coletaPendente.mq2) + ",";

  json += "\"gps_posicao_disponivel\":";
  json += posicaoGPSDisponivel ? "true" : "false";
  json += ",";
  json += "\"gps_posicao_antiga\":";
  json += posicaoGPSAntiga ? "true" : "false";
  json += ",";
  json += "\"latitude\":";
  json += posicaoGPSDisponivel ? numeroJSON((float)latitudeGPSArmazenada, 6) : "null";
  json += ",";
  json += "\"longitude\":";
  json += posicaoGPSDisponivel ? numeroJSON((float)longitudeGPSArmazenada, 6) : "null";
  json += ",";
  json += "\"satelites\":";
  json += (posicaoGPSDisponivel && satelitesGPSValidos)
          ? String(satelitesGPSArmazenados) : "null";
  json += ",";
  json += "\"altitude_m\":";
  json += (posicaoGPSDisponivel && altitudeGPSValida)
          ? numeroJSON((float)altitudeGPSArmazenada, 1) : "null";
  json += ",";

  json += "\"validade\":{";
  json += "\"temperatura_solo\":";
  json += isnan(temperaturaSolo) ? "false" : "true";
  json += ",";
  json += "\"aht20\":";
  json += coletaPendente.ahtValido ? "true" : "false";
  json += ",";
  json += "\"bmp280\":";
  json += coletaPendente.bmpValido ? "true" : "false";
  json += ",";
  json += "\"chuva\":true,";
  json += "\"luminosidade_adc\":true,";
  json += "\"umidade_solo_adc\":true,";
  json += "\"mq2_adc\":true,";
  json += "\"gps\":";
  json += posicaoGPSDisponivel ? "true" : "false";
  json += "}";
  json += "}";

  return json;
}

void atualizarRelogioGPS() {
  if (!gps.date.isValid() || !gps.time.isValid()) return;
  if (gps.date.age() > 5000 || gps.time.age() > 5000) return;

  unsigned long agoraMs = millis();
  if (horarioSincronizado &&
      fonteHorario != "GPS") {
    return;
  }

  if (horarioSincronizado &&
      fonteHorario == "GPS" &&
      agoraMs - ultimoAjusteGPS < INTERVALO_AJUSTE_GPS) {
    return;
  }

  struct tm utcInfo = {};
  utcInfo.tm_year = gps.date.year() - 1900;
  utcInfo.tm_mon = gps.date.month() - 1;
  utcInfo.tm_mday = gps.date.day();
  utcInfo.tm_hour = gps.time.hour();
  utcInfo.tm_min = gps.time.minute();
  utcInfo.tm_sec = gps.time.second();

  setenv("TZ", "UTC0", 1);
  tzset();
  time_t epochUTC = mktime(&utcInfo);

  if (epochUTC > 1700000000) {
    struct timeval tv;
    tv.tv_sec = epochUTC;
    tv.tv_usec = 0;
    settimeofday(&tv, nullptr);
    horarioSincronizado = true;
    fonteHorario = "GPS";
    ultimoAjusteGPS = agoraMs;
    Serial.println("[HORA] Relogio sincronizado pelo GPS.");
  }

  setenv("TZ", "UTC0", 1);
  tzset();
}

void atualizarPosicaoGPS() {
  bool fixAtual = GPSPosicaoAtualValida();

  if (!fixAtual) {
    if (posicaoGPSDisponivel) posicaoGPSAntiga = true;
    return;
  }

  bool primeiraPosicao = !posicaoGPSDisponivel;
  bool salvarAgora = primeiraPosicao ||
    (millis() - ultimaAtualizacaoPosicaoGPS >= INTERVALO_GPS_POSICAO);

  latitudeGPSArmazenada = gps.location.lat();
  longitudeGPSArmazenada = gps.location.lng();
  posicaoGPSDisponivel = true;
  posicaoGPSAntiga = false;

  if (gps.altitude.isValid() && gps.altitude.age() < 10000) {
    altitudeGPSArmazenada = gps.altitude.meters();
    altitudeGPSValida = true;
  } else {
    altitudeGPSValida = false;
  }

  if (gps.satellites.isValid() && gps.satellites.age() < 10000) {
    satelitesGPSArmazenados = gps.satellites.value();
    satelitesGPSValidos = true;
  } else {
    satelitesGPSValidos = false;
  }

  if (salvarAgora) {
    ultimaAtualizacaoPosicaoGPS = millis();
    salvarPosicaoGPS();
  }
}

// =====================================================
// CACHE PERSISTENTE DA ULTIMA POSICAO GPS
// =====================================================

void restaurarPosicaoGPS() {
  if (!gpsPreferencesOK) return;

  posicaoGPSDisponivel = gpsPreferences.getBool("valida", false);
  if (!posicaoGPSDisponivel) return;

  latitudeGPSArmazenada = gpsPreferences.getDouble("lat", 0.0);
  longitudeGPSArmazenada = gpsPreferences.getDouble("lon", 0.0);
  altitudeGPSArmazenada = gpsPreferences.getDouble("alt", 0.0);
  satelitesGPSArmazenados = gpsPreferences.getUInt("sats", 0);
  altitudeGPSValida = gpsPreferences.getBool("alt_ok", false);
  satelitesGPSValidos = gpsPreferences.getBool("sat_ok", false);

  // Após reiniciar, a posição persistida é mantida, mas marcada como antiga
  // até que uma atualização GPS válida seja recebida.
  posicaoGPSAntiga = true;
  ultimaAtualizacaoPosicaoGPS = millis();

  Serial.println("[GPS] Ultima posicao valida recuperada da memoria.");
}

void salvarPosicaoGPS() {
  if (!gpsPreferencesOK || !posicaoGPSDisponivel) return;

  gpsPreferences.putBool("valida", true);
  gpsPreferences.putDouble("lat", latitudeGPSArmazenada);
  gpsPreferences.putDouble("lon", longitudeGPSArmazenada);
  gpsPreferences.putDouble("alt", altitudeGPSArmazenada);
  gpsPreferences.putUInt("sats", satelitesGPSArmazenados);
  gpsPreferences.putBool("alt_ok", altitudeGPSValida);
  gpsPreferences.putBool("sat_ok", satelitesGPSValidos);
}

// =====================================================
// MONITOR SERIAL
// =====================================================

void imprimirSerial() {
  Serial.println();
  Serial.println("========== DADOS AMBIENTAIS ==========");

  Serial.print("Modo: ");
  imprimirModoSerial();
  Serial.println("Bateria: monitoramento real ainda nao instalado.");

  Serial.print("Temperatura da agua: ");
  if (isnan(temperaturaSolo)) {
    Serial.println("ERRO");
  } else {
    Serial.print(temperaturaSolo, 2);
    Serial.println(" C");
  }

  Serial.print("Chuva: ");
  Serial.println(chuva ? "SIM" : "NAO");

  Serial.print("Temperatura do ar: ");
  if (ultimaLeituraAHTValida) {
    Serial.print(temperaturaAr, 2);
    Serial.println(" C");
  } else {
    Serial.println("INDISPONIVEL");
  }

  Serial.print("Umidade do ar: ");
  if (ultimaLeituraAHTValida) {
    Serial.print(umidadeAr, 2);
    Serial.println(" %");
  } else {
    Serial.println("INDISPONIVEL");
  }

  Serial.print("Temperatura BMP280: ");
  if (ultimaLeituraBMPValida) {
    Serial.print(temperaturaBMP, 2);
    Serial.println(" C");
  } else {
    Serial.println("INDISPONIVEL");
  }

  Serial.print("Pressao: ");
  if (ultimaLeituraBMPValida) {
    Serial.print(pressao, 2);
    Serial.println(" hPa");
  } else {
    Serial.println("INDISPONIVEL");
  }

  Serial.print("Luminosidade relativa: ");
  Serial.print(luminosidadeRelativaPercentual, 1);
  Serial.println(" % (nao e lux)");
  Serial.print("Luminosidade ADC: ");
  Serial.println(luminosidadeADC);

  Serial.print("Umidade do solo: ");
  Serial.print(umidadeSoloPercentual, 1);
  Serial.println(" %");
  Serial.print("Umidade do solo ADC: ");
  Serial.println(umidadeSoloADC);

  Serial.print("MQ-2 ADC: ");
  Serial.println(mq2ADC);

  if (gps.location.isValid()) {
    Serial.print("Latitude: ");
    Serial.println(gps.location.lat(), 6);

    Serial.print("Longitude: ");
    Serial.println(gps.location.lng(), 6);
  } else {
    Serial.println("GPS: aguardando localizacao");
  }

  if (gps.satellites.isValid()) {
    Serial.print("Satelites: ");
    Serial.println(gps.satellites.value());
  }

  if (gps.altitude.isValid()) {
    Serial.print("Altitude: ");
    Serial.print(gps.altitude.meters(), 1);
    Serial.println(" m");
  }

  Serial.println("======================================");
}

void imprimirModoSerial() {
  switch (modoAtual) {
    case MODO_ESPERA:
      Serial.println("ESPERA");
      break;

    case MODO_AUTOMATICO:
      Serial.println("AUTOMATICO");
      break;

    case MODO_MANUAL:
      Serial.println("MANUAL");
      break;
  }
}

// =====================================================
// OLED
// =====================================================

void atualizarOLED() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);

  display.setCursor(0, 0);
  display.println("ESTACAO V2.6");

  display.setCursor(0, 10);
  display.print(textoModo());
  display.print(" ");
  time_t agoraOLED = time(nullptr);
  if (agoraOLED >= 1700000000) {
    struct tm horaOLED;
    localtime_r(&agoraOLED, &horaOLED);
    char horaTexto[9];
    strftime(horaTexto, sizeof(horaTexto), "%H:%M:%S", &horaOLED);
    display.print(horaTexto);
  } else {
    display.print("--:--:--");
  }

  if (!dadosColetados) {
    display.setCursor(0, 29);
    display.println("Aguardando coleta...");

    display.setCursor(0, 43);
    display.println("Azul: automatico");

    display.setCursor(0, 54);
    display.println("Branco: coleta manual");

    display.display();
    return;
  }

  // Tela 0: resumo geral (inclui os dados atmosfericos).
  if (telaAtual == 0) {
    display.setCursor(0, 21);
    display.print("Agua: ");
    if (isnan(temperaturaSolo)) display.println("ERRO");
    else { display.print(temperaturaSolo, 1); display.println(" C"); }

    display.setCursor(0, 30);
    display.print("Ar: ");
    if (ultimaLeituraAHTValida) { display.print(temperaturaAr, 1); display.print(" C  "); }
    else display.print("--  ");
    display.print("UR: ");
    if (ultimaLeituraAHTValida) { display.print(umidadeAr, 0); display.println("%"); }
    else display.println("--");

    display.setCursor(0, 39);
    display.print("Pressao: ");
    if (ultimaLeituraBMPValida) { display.print(pressao, 1); display.println(" hPa"); }
    else display.println("--");

    display.setCursor(0, 48);
    display.print("Chuva: ");
    display.println(chuva ? "SIM" : "NAO");
  }

  // Tela 1: solo
  else if (telaAtual == 1) {
    display.setCursor(0, 25);
    display.print("Temp Agua: ");

    if (isnan(temperaturaSolo)) {
      display.println("ERRO");
    } else {
      display.print(temperaturaSolo, 1);
      display.println(" C");
    }

    display.setCursor(0, 39);
    display.print("Umidade solo: ");
    display.print(umidadeSoloPercentual, 0);
    display.println("%");
    display.setCursor(0, 52);
    display.println("Calibrado: 1500-3150");
  }

  // Tela 2: luz e MQ-2
  else if (telaAtual == 2) {
    display.setCursor(0, 26);
    display.print("Luz relativa: ");
    display.print(luminosidadeRelativaPercentual, 0);
    display.println("%");

    display.setCursor(0, 40);
    display.print("MQ-2 ADC: ");
    display.println(mq2ADC);

    display.setCursor(0, 53);
    display.println("Relativa, nao lux");
  }

  // Tela 3: GPS (posicao em cache, atualizada no maximo a cada hora)
  else if (telaAtual == 3) {
    if (posicaoGPSDisponivel) {
      display.setCursor(0, 22);
      display.print("Lat: ");
      display.println(latitudeGPSArmazenada, 4);

      display.setCursor(0, 32);
      display.print("Lon: ");
      display.println(longitudeGPSArmazenada, 4);

      display.setCursor(0, 42);
      display.print("Sat: ");
      if (satelitesGPSValidos) display.println(satelitesGPSArmazenados);
      else display.println("--");

      display.setCursor(0, 52);
      display.print("Alt: ");
      if (altitudeGPSValida) {
        display.print(altitudeGPSArmazenada, 0);
        display.print("m");
      } else {
        display.print("--");
      }
      display.print(posicaoGPSAntiga ? " ANTIGA" : " ATUAL");
    } else {
      display.setCursor(0, 34);
      display.println("Aguardando GPS...");
    }
  }

  display.display();
}
