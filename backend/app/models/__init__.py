import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, JSON, Float, Boolean
from sqlalchemy.orm import relationship
from app.core.database import Base

class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, index=True, nullable=False)
    senha_hash = Column(String(255), nullable=False)
    eh_administrador = Column(Boolean, default=False, nullable=False)
    pode_acessar_animais = Column(Boolean, default=True, nullable=False)
    pode_acessar_equipamentos = Column(Boolean, default=True, nullable=False)
    pode_acessar_estacoes = Column(Boolean, default=True, nullable=False)
    pode_gerenciar_alarmes = Column(Boolean, default=True, nullable=False)
    pode_gerenciar_propriedades = Column(Boolean, default=False, nullable=False)
    administrador_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    criado_em = Column(DateTime, default=datetime.datetime.utcnow)

    propriedades = relationship("Propriedade", back_populates="proprietario", cascade="all, delete-orphan", foreign_keys="[Propriedade.usuario_id]")
    propriedades_associadas = relationship("UsuarioPropriedade", back_populates="usuario", cascade="all, delete-orphan")


class UsuarioPropriedade(Base):
    __tablename__ = "usuarios_propriedades"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False)
    propriedade_id = Column(Integer, ForeignKey("propriedades.id", ondelete="CASCADE"), nullable=False)
    criado_em = Column(DateTime, default=datetime.datetime.utcnow)

    usuario = relationship("Usuario", back_populates="propriedades_associadas")
    propriedade = relationship("Propriedade", back_populates="membros")


class Propriedade(Base):
    __tablename__ = "propriedades"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    nome = Column(String(100), nullable=False)
    descricao = Column(Text, nullable=True)
    # GeoJSON armazenado como JSON: {"type": "Polygon", "coordinates": [[[lat, lng], [lat, lng], ...]]}
    poligono_geojson = Column(JSON, nullable=False)
    criado_em = Column(DateTime, default=datetime.datetime.utcnow)

    proprietario = relationship("Usuario", back_populates="propriedades", foreign_keys=[usuario_id])
    membros = relationship("UsuarioPropriedade", back_populates="propriedade", cascade="all, delete-orphan")
    animais = relationship("Animal", back_populates="propriedade", cascade="all, delete-orphan")
    equipamentos = relationship("Equipamento", back_populates="propriedade", cascade="all, delete-orphan")
    estacoes_ambientais = relationship("EstacaoAmbiental", back_populates="propriedade", cascade="all, delete-orphan")
    alertas = relationship("Alerta", back_populates="propriedade", cascade="all, delete-orphan")


class Animal(Base):
    __tablename__ = "animais"

    id = Column(Integer, primary_key=True, index=True)
    propriedade_id = Column(Integer, ForeignKey("propriedades.id"), nullable=False)
    numero_brinco = Column(String(50), index=True, nullable=False)  # Número do Brinco (único por conta)
    especie = Column(String(50), nullable=False)  # Bovino, Ovino, Caprino, etc.
    raca = Column(String(50), nullable=True)     # Nelore, Angus, etc.
    dispositivo_id = Column(String(100), index=True, nullable=False) # ID do Rastreador IoT (único por conta)
    intervalo_gps_segundos = Column(Integer, default=10, nullable=False) # Taxa de leitura do GPS
    intervalo_envio_segundos = Column(Integer, default=5, nullable=False) # Taxa de transmissão MQTT
    economia_energia = Column(Boolean, default=True, nullable=False) # Se True, ativa Deep Sleep; se False, modo bancada
    criado_em = Column(DateTime, default=datetime.datetime.utcnow)

    propriedade = relationship("Propriedade", back_populates="animais")


class Equipamento(Base):
    __tablename__ = "equipamentos"

    id = Column(Integer, primary_key=True, index=True)
    propriedade_id = Column(Integer, ForeignKey("propriedades.id"), nullable=False)
    nome = Column(String(100), nullable=False)     # Ex: Trator John Deere
    tipo = Column(String(50), nullable=False)      # Trator, Colheitadeira, Pulverizador, etc.
    modelo = Column(String(50), nullable=True)
    dispositivo_id = Column(String(100), index=True, nullable=False) # ID do Rastreador IoT (único por conta)
    intervalo_envio_segundos = Column(Integer, default=20, nullable=False) # Taxa de transmissão MQTT em segundos
    criado_em = Column(DateTime, default=datetime.datetime.utcnow)

    propriedade = relationship("Propriedade", back_populates="equipamentos")


class EstacaoAmbiental(Base):
    __tablename__ = "estacoes_ambientais"

    id = Column(Integer, primary_key=True, index=True)
    propriedade_id = Column(Integer, ForeignKey("propriedades.id"), nullable=False)
    nome = Column(String(100), nullable=False)     # Ex: Estação Meteorológica Norte
    latitude = Column(Float, nullable=True)        # Preenchida automaticamente via GPS da telemetria
    longitude = Column(Float, nullable=True)       # Preenchida automaticamente via GPS da telemetria
    dispositivo_id = Column(String(100), index=True, nullable=False) # ID do Módulo IoT (único por conta)
    criado_em = Column(DateTime, default=datetime.datetime.utcnow)

    propriedade = relationship("Propriedade", back_populates="estacoes_ambientais")


class Alerta(Base):
    __tablename__ = "alertas"

    id = Column(Integer, primary_key=True, index=True)
    propriedade_id = Column(Integer, ForeignKey("propriedades.id"), nullable=False)
    dispositivo_id = Column(String(100), nullable=False)
    tipo = Column(String(50), nullable=False)      # CERCA_VIRTUAL, FEBRE, FREQUENCIA_CARDIACA, SOLO_SECO
    severidade = Column(String(20), default="ALTA")  # CRITICA, ALTA, MEDIA, BAIXA
    mensagem = Column(Text, nullable=False)
    esta_ativo = Column(Boolean, default=True)
    criado_em = Column(DateTime, default=datetime.datetime.utcnow)

    propriedade = relationship("Propriedade", back_populates="alertas")


# Aliases para compatibilidade interna
User = Usuario
Property = Propriedade
Equipment = Equipamento
EnvironmentalStation = EstacaoAmbiental
Alarm = Alerta
UserProperty = UsuarioPropriedade
