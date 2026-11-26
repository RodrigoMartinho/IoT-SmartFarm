# 🌾 Plataforma IoT SmartFarm

Sistema Web completo para delimitação de propriedades rurais, cadastro e monitoramento em tempo real de **animais** (geolocalização, temperatura corporal, batimentos cardíacos, aceleração e postura), **equipamentos** (tratores/maquinários com corrente elétrica, status operacional e GPS) e **módulos ambientais** (estações meteorológicas e umidade do solo), alimentado por **MQTT**, **MongoDB**, **PostgreSQL**, **FastAPI** e **React**.

---

## 🏗️ Arquitetura e Tecnologias

- **Frontend**: React, Vite, TypeScript, Tailwind CSS e Leaflet Maps (desenho interativo de polígonos de fazendas e visualização de telemetria em tempo real).
- **Backend API**: Python com FastAPI, SQLAlchemy, Pydantic e autenticação JWT (`Bearer Token`) com controle de acesso por conta/propriedade e papéis.
- **Cerca virtual**: Shapely (validação de perímetro da fazenda e geração automática de alarmes de fuga).
- **Banco Relacional**: PostgreSQL (usuários, propriedades, animais, equipamentos, estações ambientais e alarmes).
- **Banco NoSQL**: MongoDB (séries temporais e histórico de telemetrias IoT).
- **Broker de Mensageria**: Eclipse Mosquitto (MQTT para telemetria Store-and-Forward, confirmações ACK e configuração remota OTA).

---

## 📋 Pré-requisitos

Para executar o projeto, é necessário ter instalado:

- **Python 3.11+**
- **Node.js 20+** e **npm**
- **PostgreSQL 15+**
- **MongoDB 6+**
- **Eclipse Mosquitto** (Broker MQTT na porta `1883`)

---

## 🚀 Como Executar o Projeto Passo a Passo

### 1. Configurar Variáveis de Ambiente

Na raiz do projeto, copie o arquivo de exemplo `.env.example` para `.env` e preencha com as credenciais do seu PostgreSQL, MongoDB, Mosquitto e uma chave JWT:

```bash
# Linux/Mac
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```

> Certifique-se de que as variáveis de ambiente estejam carregadas no terminal (ou no ambiente do sistema) antes de iniciar o backend.

---

### 2. Configurar e Executar o Backend (FastAPI)

1. Entre na pasta `backend` e crie/ative o ambiente virtual Python:
```bash
cd backend
python -m venv venv
# Windows PowerShell:
.\venv\Scripts\Activate.ps1
# Linux/Mac:
source venv/bin/activate
```

2. Instale as dependências:
```bash
pip install -r requirements.txt
```

3. (Opcional) Execute a carga inicial de dados de exemplo (Seed Data):
```bash
python seed_data.py
```
*Cria usuários, propriedades modelo, animais, equipamentos e estações ambientais de demonstração.*

4. Inicie o servidor FastAPI:
```bash
uvicorn app.main:app --reload --port 8000
```
- **API**: http://localhost:8000
- **Documentação Swagger**: http://localhost:8000/docs

---

### 3. Executar o Frontend Web (React + Vite)

Em um novo terminal, acesse a pasta `frontend`:

```bash
cd frontend
npm install
npm run dev
```
- **Acesse no navegador**: http://localhost:3000

---

### 4. (Opcional) Iniciar o Simulador de Sensores IoT (Python)

Com o Broker MQTT e o Backend em execução, você pode simular o envio de telemetrias de animais, equipamentos e estações:

```bash
# Na raiz do projeto:
python scripts/iot_simulator.py

# Ou dentro da pasta backend/:
python iot_simulator.py
```

---

### 5. Dispositivos Físicos IoT (ESP32 no Arduino IDE)

Os códigos-fonte embarcados estão na pasta `Arduino/`:

- `Arduino/animal/animal.ino` (ESP32-C6 — DS18B20, MAX30102, BMI160, GPS, Store-and-Forward e OTA com Deep Sleep)
- `Arduino/equipamento/equipamento.ino` (ESP32 — sensor de corrente ACS712/HW-872, GPS, Store-and-Forward e OTA)
- `Arduino/ambiental/ambiental.ino` (ESP32 — AHT20, BMP280, DS18B20, sensores de solo/chuva/luminosidade/MQ-2, GPS e OLED)

Antes de compilar:
1. Preencha o endereço do broker e as credenciais MQTT em `Arduino/animal/secrets.h` e `Arduino/equipamento/secrets.h` (ou diretamente no topo de `Arduino/ambiental/ambiental.ino`).
2. Nos módulos **Animal** e **Equipamento**, as credenciais de Wi-Fi, o e-mail da conta e o `dispositivo_id` são configurados em campo via portal cativo (`WiFiManager`).

---

## 🧪 Testes Automatizados

- **Backend (`pytest`)**:
```bash
pytest backend/tests -v
```

- **Frontend (`Vitest`)**:
```bash
cd frontend
npm test -- --run
```

---

## 🎯 Funcionalidades Principais

1. 🔐 **Autenticação JWT**: Login protegido, isolamento multi-conta (tenant), permissões granulares por módulo e rate limiting em `/login` e `/registro`.
2. 🗺️ **Desenho Interativo de Propriedade**: Marcação no mapa dos vértices do perímetro da fazenda com polígonos GeoJSON.
3. 🐄 **Monitoramento Animal**: Temperatura corporal (alerta de febre), frequência cardíaca, acelerômetro/postura e geolocalização com configuração remota OTA (ciclo de coleta/envio e modo de economia de energia).
4. 🚨 **Motor de Cerca virtual & Alarmes**: Detecção de saída do perímetro da fazenda, anomalias vitais e solo seco com central de reconhecimento de alarmes.
5. 🚜 **Rastreamento de Maquinário**: Status ligado/desligado por sensor de corrente, velocidade e posição GPS.
6. 🌤️ **Monitoramento Ambiental**: Temperatura do ar/solo, umidade, pressão atmosférica, chuva, luminosidade, gás/fumaça e umidade do solo.