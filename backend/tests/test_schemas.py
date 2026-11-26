import pytest
from pydantic import ValidationError
from app.schemas import (
    UsuarioCriacao,
    AnimalCriacao,
    AnimalAtualizacao,
    PropriedadeCriacao
)

def test_usuario_criacao_valid_email():
    """Valida criação de usuário com e-mail correto."""
    dados = {
        "nome": "João Produtor",
        "email": "joao.produtor@fazenda.com.br",
        "senha": "MinhaSenhaForte123"
    }
    usuario = UsuarioCriacao(**dados)
    assert usuario.email == "joao.produtor@fazenda.com.br"
    assert usuario.nome == "João Produtor"

def test_usuario_criacao_invalid_email():
    """E-mail sem formato válido deve disparar ValidationError."""
    dados = {
        "nome": "João Produtor",
        "email": "email_invalido_sem_arroba",
        "senha": "MinhaSenhaForte123"
    }
    with pytest.raises(ValidationError):
        UsuarioCriacao(**dados)

def test_animal_criacao_defaults():
    """Valida que intervalos padrão de GPS e envio são atribuídos se omitidos."""
    dados = {
        "propriedade_id": 1,
        "numero_brinco": "BR-9999",
        "especie": "Bovino",
        "dispositivo_id": "DEV_BOV_9999"
    }
    animal = AnimalCriacao(**dados)
    assert animal.intervalo_gps_segundos == 10
    assert animal.intervalo_envio_segundos == 5

def test_animal_criacao_custom_intervals():
    """Valida atribuição correta de intervalos personalizados."""
    dados = {
        "propriedade_id": 1,
        "numero_brinco": "BR-8888",
        "especie": "Bovino",
        "dispositivo_id": "DEV_BOV_8888",
        "intervalo_gps_segundos": 60,
        "intervalo_envio_segundos": 300
    }
    animal = AnimalCriacao(**dados)
    assert animal.intervalo_gps_segundos == 60
    assert animal.intervalo_envio_segundos == 300

def test_propriedade_criacao(poligono_fazenda):
    """Valida schema de criação de propriedade com polígono GeoJSON."""
    dados = {
        "nome": "Fazenda Modelo",
        "descricao": "Propriedade para gado de corte",
        "poligono_geojson": poligono_fazenda
    }
    prop = PropriedadeCriacao(**dados)
    assert prop.nome == "Fazenda Modelo"
    assert "coordinates" in prop.poligono_geojson

