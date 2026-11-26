from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field

# --- AUTENTICAÇÃO & USUÁRIO ---
class UsuarioCriacao(BaseModel):
    nome: str
    email: EmailStr
    senha: str
    codigo_convite: Optional[str] = None
    honeypot: Optional[str] = None

class UsuarioLogin(BaseModel):
    email: EmailStr
    senha: str

class UsuarioResposta(BaseModel):
    id: int
    nome: str
    email: EmailStr
    eh_administrador: bool = False
    pode_acessar_animais: bool = True
    pode_acessar_equipamentos: bool = True
    pode_acessar_estacoes: bool = True
    pode_gerenciar_alarmes: bool = True
    pode_gerenciar_propriedades: bool = False
    administrador_id: Optional[int] = None
    propriedades_ids: List[int] = []
    criado_em: datetime

    class Config:
        from_attributes = True

class UsuarioColaboradorCriacao(BaseModel):
    nome: str
    email: EmailStr
    senha: str
    eh_administrador: bool = False
    pode_acessar_animais: bool = True
    pode_acessar_equipamentos: bool = True
    pode_acessar_estacoes: bool = True
    pode_gerenciar_alarmes: bool = True
    pode_gerenciar_propriedades: bool = False
    propriedades_ids: List[int] = []

class UsuarioColaboradorAtualizacao(BaseModel):
    nome: Optional[str] = None
    email: Optional[EmailStr] = None
    senha: Optional[str] = None
    eh_administrador: Optional[bool] = None
    pode_acessar_animais: Optional[bool] = None
    pode_acessar_equipamentos: Optional[bool] = None
    pode_acessar_estacoes: Optional[bool] = None
    pode_gerenciar_alarmes: Optional[bool] = None
    pode_gerenciar_propriedades: Optional[bool] = None
    propriedades_ids: Optional[List[int]] = None

class Token(BaseModel):
    token_acesso: str
    tipo_token: str = "bearer"

class TokenPayload(BaseModel):
    sub: Optional[str] = None


# --- PROPRIEDADE ---
class PropriedadeCriacao(BaseModel):
    nome: str
    descricao: Optional[str] = None
    # Formato GeoJSON: {"type": "Polygon", "coordinates": [[[lat, lng], [lat, lng], ...]]}
    poligono_geojson: Dict[str, Any]

class PropriedadeAtualizacao(BaseModel):
    nome: Optional[str] = None
    descricao: Optional[str] = None
    poligono_geojson: Optional[Dict[str, Any]] = None

class PropriedadeResposta(BaseModel):
    id: int
    usuario_id: int
    nome: str
    descricao: Optional[str]
    poligono_geojson: Dict[str, Any]
    criado_em: datetime

    class Config:
        from_attributes = True


# --- ANIMAL ---
class AnimalCriacao(BaseModel):
    propriedade_id: int
    numero_brinco: str
    especie: str
    raca: Optional[str] = None
    dispositivo_id: str
    intervalo_gps_segundos: Optional[int] = 10
    intervalo_envio_segundos: Optional[int] = 5
    economia_energia: Optional[bool] = True

class AnimalAtualizacao(BaseModel):
    numero_brinco: Optional[str] = None
    especie: Optional[str] = None
    raca: Optional[str] = None
    dispositivo_id: Optional[str] = None
    intervalo_gps_segundos: Optional[int] = None
    intervalo_envio_segundos: Optional[int] = None
    economia_energia: Optional[bool] = None

class AnimalResposta(BaseModel):
    id: int
    propriedade_id: int
    numero_brinco: str
    especie: str
    raca: Optional[str]
    dispositivo_id: str
    intervalo_gps_segundos: int = 10
    intervalo_envio_segundos: int = 5
    economia_energia: bool = True
    ultima_telemetria: Optional[Dict[str, Any]] = None
    criado_em: datetime

    class Config:
        from_attributes = True


# --- EQUIPAMENTO ---
class EquipamentoCriacao(BaseModel):
    propriedade_id: int
    nome: str
    tipo: str
    modelo: Optional[str] = None
    dispositivo_id: str
    intervalo_envio_segundos: Optional[int] = 20

class EquipamentoAtualizacao(BaseModel):
    nome: Optional[str] = None
    tipo: Optional[str] = None
    modelo: Optional[str] = None
    dispositivo_id: Optional[str] = None
    intervalo_envio_segundos: Optional[int] = None

class EquipamentoResposta(BaseModel):
    id: int
    propriedade_id: int
    nome: str
    tipo: str
    modelo: Optional[str]
    dispositivo_id: str
    intervalo_envio_segundos: int = 20
    criado_em: datetime

    class Config:
        from_attributes = True


# --- ESTAÇÃO AMBIENTAL ---
class EstacaoAmbientalCriacao(BaseModel):
    propriedade_id: int
    nome: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    dispositivo_id: str

class EstacaoAmbientalAtualizacao(BaseModel):
    nome: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    dispositivo_id: Optional[str] = None

class EstacaoAmbientalResposta(BaseModel):
    id: int
    propriedade_id: int
    nome: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    dispositivo_id: str
    ultima_telemetria: Optional[Dict[str, Any]] = None
    criado_em: datetime

    class Config:
        from_attributes = True


# --- ALERTAS / ALARMES ---
class AlertaResposta(BaseModel):
    id: int
    propriedade_id: int
    dispositivo_id: str
    tipo: str
    severidade: str
    mensagem: str
    esta_ativo: bool
    criado_em: datetime

    class Config:
        from_attributes = True


# --- TELEMETRIA (IoT) ---
class TelemetriaAnimalSchema(BaseModel):
    dispositivo_id: str
    latitude: float
    longitude: float
    temperatura_corporal: float
    frequencia_cardiaca: int
    acelerometro: Dict[str, float]  # {"x": 0.1, "y": 0.2, "z": 9.8}
    data_hora: datetime

class TelemetriaEquipamentoSchema(BaseModel):
    dispositivo_id: str
    latitude: float
    longitude: float
    velocidade: Optional[float] = 0.0
    status_motor: Optional[str] = "LIGADO"
    data_hora: datetime

class TelemetriaAmbientalSchema(BaseModel):
    dispositivo_id: str
    temperatura: float
    umidade: float
    pressao_atmosferica: float
    umidade_solo: float  # Percentual % (ex: 15.5% -> solo seco se < 20%)
    data_hora: datetime


# Aliases para compatibilidade
UserCreate = UsuarioCriacao
UserLogin = UsuarioLogin
UserResponse = UsuarioResposta
PropertyCreate = PropriedadeCriacao
PropertyResponse = PropriedadeResposta
AnimalCreate = AnimalCriacao
AnimalUpdate = AnimalAtualizacao
AnimalResponse = AnimalResposta
EquipmentCreate = EquipamentoCriacao
EquipmentUpdate = EquipamentoAtualizacao
EquipmentResponse = EquipamentoResposta
EnvironmentalStationCreate = EstacaoAmbientalCriacao
EnvironmentalStationUpdate = EstacaoAmbientalAtualizacao
EnvironmentalStationResponse = EstacaoAmbientalResposta
AlarmResponse = AlertaResposta
AnimalTelemetrySchema = TelemetriaAnimalSchema
EquipmentTelemetrySchema = TelemetriaEquipamentoSchema
EnvironmentalTelemetrySchema = TelemetriaAmbientalSchema
