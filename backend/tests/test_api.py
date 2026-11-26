from unittest.mock import patch

def test_root_endpoint(client):
    """Testa endpoint raiz da API."""
    response = client.get("/")
    assert response.status_code == 200
    dados = response.json()
    assert "version" in dados
    assert "SmartFarm" in dados["message"]

def test_login_success(client, usuario_admin):
    """Testa login com credenciais válidas retornando token Bearer."""
    response = client.post(
        "/api/v1/autenticacao/login",
        data={"username": usuario_admin.email, "password": "Senha123!"}
    )
    assert response.status_code == 200
    dados = response.json()
    assert "token_acesso" in dados
    assert dados["tipo_token"] == "bearer"

def test_login_invalid_password(client, usuario_admin):
    """Testa login com senha incorreta retornando 401 Unauthorized."""
    response = client.post(
        "/api/v1/autenticacao/login",
        data={"username": usuario_admin.email, "password": "SenhaIncorretaErrada"}
    )
    assert response.status_code == 401

def test_protected_routes_require_token(client):
    """Testa rejeição de acesso a endpoints protegidos sem header Authorization."""
    response = client.get("/api/v1/propriedades")
    assert response.status_code == 401

def test_create_and_list_properties(client, headers_admin, poligono_fazenda):
    """Testa criação e listagem de propriedades com polígono GeoJSON."""
    dados_propriedade = {
        "nome": "Fazenda Boa Esperança",
        "descricao": "Área de pastagem rotacionada",
        "poligono_geojson": poligono_fazenda
    }
    # Cria a propriedade
    res_criacao = client.post("/api/v1/propriedades", json=dados_propriedade, headers=headers_admin)
    assert res_criacao.status_code in (200, 201)
    prop_criada = res_criacao.json()
    assert prop_criada["nome"] == "Fazenda Boa Esperança"
    assert "id" in prop_criada

    # Lista propriedades
    res_lista = client.get("/api/v1/propriedades", headers=headers_admin)
    assert res_lista.status_code == 200
    lista = res_lista.json()
    assert len(lista) >= 1
    assert any(p["nome"] == "Fazenda Boa Esperança" for p in lista)

def test_create_animal_with_ota_intervals(client, headers_admin, poligono_fazenda):
    """Testa cadastro de animal com taxas personalizadas de GPS e envio MQTT."""
    # 1. Cria a propriedade prévia
    res_prop = client.post(
        "/api/v1/propriedades",
        json={"nome": "Pasto Norte", "poligono_geojson": poligono_fazenda},
        headers=headers_admin
    )
    assert res_prop.status_code in (200, 201)
    prop_id = res_prop.json()["id"]

    # 2. Mock do publisher MQTT para não tentar publicar via broker real no teste
    with patch("app.api.v1.animals.publicar_configuracao_animal") as mock_pub:
        dados_animal = {
            "propriedade_id": prop_id,
            "numero_brinco": "BR-API-101",
            "especie": "Bovino",
            "raca": "Angus",
            "dispositivo_id": "COLAR_ESP32_101",
            "intervalo_gps_segundos": 45,
            "intervalo_envio_segundos": 180
        }
        res_animal = client.post("/api/v1/animais", json=dados_animal, headers=headers_admin)
        assert res_animal.status_code in (200, 201)
        animal_criado = res_animal.json()

        assert animal_criado["numero_brinco"] == "BR-API-101"
        assert animal_criado["intervalo_gps_segundos"] == 45
        assert animal_criado["intervalo_envio_segundos"] == 180

        # Verifica se o downlink OTA MQTT foi acionado com os parâmetros corretos
        mock_pub.assert_called_once_with(
            dispositivo_id="COLAR_ESP32_101",
            intervalo_gps_segundos=45,
            intervalo_envio_segundos=180,
            economia_energia=True
        )

def test_create_equipment_with_ota_interval(client, headers_admin, poligono_fazenda):
    """Testa cadastro de equipamento com taxa de envio MQTT e disparo de downlink OTA."""
    res_prop = client.post(
        "/api/v1/propriedades",
        json={"nome": "Área de Máquinas", "poligono_geojson": poligono_fazenda},
        headers=headers_admin
    )
    assert res_prop.status_code in (200, 201)
    prop_id = res_prop.json()["id"]

    with patch("app.api.v1.equipments.publicar_configuracao_equipamento") as mock_pub:
        dados_equip = {
            "propriedade_id": prop_id,
            "nome": "Trator Valmet 885",
            "tipo": "Trator",
            "modelo": "885 Turbo",
            "dispositivo_id": "EQUIP_TRAC_VALMET",
            "intervalo_envio_segundos": 10
        }
        res_eq = client.post("/api/v1/equipamentos", json=dados_equip, headers=headers_admin)
        assert res_eq.status_code in (200, 201)
        eq_criado = res_eq.json()
        assert eq_criado["nome"] == "Trator Valmet 885"
        assert eq_criado["intervalo_envio_segundos"] == 10

        mock_pub.assert_called_once_with(
            dispositivo_id="EQUIP_TRAC_VALMET",
            intervalo_envio_segundos=10
        )


def test_partial_ota_config_update_animal_and_equipment(client, headers_admin, poligono_fazenda):
    """Testa atualização parcial via modal de Configuração Remota para animais e equipamentos."""
    res_prop = client.post(
        "/api/v1/propriedades",
        json={"nome": "Fazenda Config OTA", "poligono_geojson": poligono_fazenda},
        headers=headers_admin
    )
    assert res_prop.status_code in (200, 201)
    prop_id = res_prop.json()["id"]

    with patch("app.api.v1.animals.publicar_configuracao_animal") as mock_pub_anim:
        res_an = client.post(
            "/api/v1/animais",
            json={
                "propriedade_id": prop_id,
                "numero_brinco": "BR-OTA-01",
                "especie": "Bovino",
                "raca": "Nelore",
                "dispositivo_id": "COLAR_OTA_01",
            },
            headers=headers_admin,
        )
        assert res_an.status_code in (200, 201)
        an_id = res_an.json()["id"]

        res_put_an = client.put(
            f"/api/v1/animais/{an_id}",
            json={
                "intervalo_gps_segundos": 30,
                "intervalo_envio_segundos": 15,
                "economia_energia": False,
            },
            headers=headers_admin,
        )
        assert res_put_an.status_code == 200
        an_atualizado = res_put_an.json()
        assert an_atualizado["numero_brinco"] == "BR-OTA-01"
        assert an_atualizado["intervalo_gps_segundos"] == 30
        assert an_atualizado["intervalo_envio_segundos"] == 15
        assert an_atualizado["economia_energia"] is False
        assert mock_pub_anim.call_count == 2

    with patch("app.api.v1.equipments.publicar_configuracao_equipamento") as mock_pub_eq:
        res_eq = client.post(
            "/api/v1/equipamentos",
            json={
                "propriedade_id": prop_id,
                "nome": "Pulverizador Jacto",
                "tipo": "Pulverizador",
                "dispositivo_id": "EQUIP_OTA_01",
            },
            headers=headers_admin,
        )
        assert res_eq.status_code in (200, 201)
        eq_id = res_eq.json()["id"]

        res_put_eq = client.put(
            f"/api/v1/equipamentos/{eq_id}",
            json={"intervalo_envio_segundos": 60},
            headers=headers_admin,
        )
        assert res_put_eq.status_code == 200
        eq_atualizado = res_put_eq.json()
        assert eq_atualizado["nome"] == "Pulverizador Jacto"
        assert eq_atualizado["intervalo_envio_segundos"] == 60
        assert mock_pub_eq.call_count == 2


def test_case_insensitive_telemetry_lookup(client, headers_admin, poligono_fazenda):
    """Garante que consultas de telemetria toleram variação de maiúsculas/minúsculas no dispositivo_id."""
    from unittest.mock import MagicMock

    res_prop = client.post(
        "/api/v1/propriedades",
        json={"nome": "Fazenda Case", "poligono_geojson": poligono_fazenda},
        headers=headers_admin
    )
    prop_id = res_prop.json()["id"]

    res_est = client.post(
        "/api/v1/estacoes-ambientais",
        json={
            "propriedade_id": prop_id,
            "nome": "Estação Teste",
            "dispositivo_id": "ambiental_01",
        },
        headers=headers_admin,
    )
    assert res_est.status_code in (200, 201)

    fake_collection = MagicMock()
    fake_collection.find_one.return_value = None
    fake_mongo = MagicMock()
    fake_mongo.__getitem__.return_value = fake_collection

    with patch("app.api.v1.telemetry.mongo_db", fake_mongo):
        res_ultima = client.get("/api/v1/telemetria/ultima/Ambiental_01", headers=headers_admin)
        assert res_ultima.status_code == 200

