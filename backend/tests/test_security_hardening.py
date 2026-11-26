from unittest.mock import patch, MagicMock
from starlette.requests import Request
from app.models import Usuario, UsuarioPropriedade, Propriedade, Animal, Equipamento
from app.core.security import get_password_hash, create_access_token
from app.core.network import obter_ip_cliente
from app.api.v1.auth import REGISTRATION_ATTEMPTS


def _criar_headers(usuario: Usuario) -> dict:
    token = create_access_token(subject=str(usuario.id))
    return {"Authorization": f"Bearer {token}"}


# =====================================================================
# ITEM 1 (C1): Proteção contra IDOR e Permissões Modulares na Telemetria
# =====================================================================

def test_telemetry_idor_cross_tenant_blocked(client, db_session, usuario_admin, poligono_fazenda):
    """Garante que um usuário de outra conta (Tenant B) não acesse nem apague telemetria do Tenant A."""
    # 1. Cria propriedade e dispositivos no Tenant A (usuario_admin)
    prop_a = Propriedade(
        nome="Fazenda Tenant A",
        poligono_geojson=poligono_fazenda,
        usuario_id=usuario_admin.id
    )
    db_session.add(prop_a)
    db_session.commit()
    db_session.refresh(prop_a)

    animal_a = Animal(
        propriedade_id=prop_a.id,
        numero_brinco="BR-A-001",
        especie="Bovino",
        dispositivo_id="COLAR_TENANT_A"
    )
    equip_a = Equipamento(
        propriedade_id=prop_a.id,
        nome="Trator A",
        tipo="Trator",
        dispositivo_id="TRATOR_TENANT_A"
    )
    db_session.add_all([animal_a, equip_a])

    # 2. Cria usuário independente (Tenant B) e um operador restrito do Tenant A
    usuario_tenant_b = Usuario(
        nome="Fazendeiro Tenant B",
        email="tenant.b@smartfarm.com",
        senha_hash=get_password_hash("Senha123!"),
        eh_administrador=True,
        administrador_id=None
    )
    operador_sem_equip = Usuario(
        nome="Operador Só Animais",
        email="op.animais@smartfarm.com",
        senha_hash=get_password_hash("Senha123!"),
        eh_administrador=False,
        administrador_id=usuario_admin.id,
        pode_acessar_animais=True,
        pode_acessar_equipamentos=False,
        pode_acessar_estacoes=False,
        pode_gerenciar_alarmes=False
    )
    db_session.add_all([usuario_tenant_b, operador_sem_equip])
    db_session.commit()
    db_session.refresh(operador_sem_equip)

    db_session.add(UsuarioPropriedade(usuario_id=operador_sem_equip.id, propriedade_id=prop_a.id))
    db_session.commit()

    headers_a = _criar_headers(usuario_admin)
    headers_b = _criar_headers(usuario_tenant_b)
    headers_op = _criar_headers(operador_sem_equip)

    # Tenant B tentando acessar/excluir telemetria do dispositivo do Tenant A -> 404
    assert client.get("/api/v1/telemetria/ultima/COLAR_TENANT_A", headers=headers_b).status_code == 404
    assert client.get("/api/v1/telemetria/historico/COLAR_TENANT_A", headers=headers_b).status_code == 404
    assert client.delete("/api/v1/telemetria/historico/COLAR_TENANT_A", headers=headers_b).status_code == 404

    # Operador do Tenant A sem permissão de equipamentos tentando acessar TRATOR_TENANT_A -> 403
    res_op_equip = client.get("/api/v1/telemetria/ultima/TRATOR_TENANT_A", headers=headers_op)
    assert res_op_equip.status_code == 403

    # Tenant A acessando seu próprio dispositivo com MongoDB mockado -> 200
    fake_collection = MagicMock()
    fake_collection.find_one.return_value = {"dispositivo_id": "COLAR_TENANT_A", "bateria": 95}
    fake_cursor = MagicMock()
    fake_cursor.limit.return_value = [{"dispositivo_id": "COLAR_TENANT_A", "bateria": 95}]
    fake_collection.find.return_value = fake_cursor
    fake_delete_res = MagicMock()
    fake_delete_res.deleted_count = 1
    fake_collection.delete_many.return_value = fake_delete_res

    fake_mongo_db = MagicMock()
    fake_mongo_db.__getitem__.return_value = fake_collection

    with patch("app.api.v1.telemetry.mongo_db", fake_mongo_db):
        res_ultima = client.get("/api/v1/telemetria/ultima/COLAR_TENANT_A", headers=headers_a)
        assert res_ultima.status_code == 200
        assert res_ultima.json()["dados"]["dispositivo_id"] == "COLAR_TENANT_A"

        res_hist = client.get("/api/v1/telemetria/historico/COLAR_TENANT_A", headers=headers_a)
        assert res_hist.status_code == 200
        assert res_hist.json()["total"] == 1

        res_del = client.delete("/api/v1/telemetria/historico/COLAR_TENANT_A", headers=headers_a)
        assert res_del.status_code == 200
        assert res_del.json()["total_removido"] == 6


# =====================================================================
# ITEM 4 (A2): Proteção da Hierarquia de Administradores (Usuários)
# =====================================================================

def test_admin_hierarchy_prevents_privilege_escalation(client, db_session, usuario_admin):
    """Garante que sub-administradores não alterem o titular nem promovam/removam outros admins."""
    sub_admin = Usuario(
        nome="Gerente Sub-Admin",
        email="subadmin@smartfarm.com",
        senha_hash=get_password_hash("Senha123!"),
        eh_administrador=True,
        administrador_id=usuario_admin.id,
        pode_acessar_animais=True,
        pode_acessar_equipamentos=True,
        pode_acessar_estacoes=True,
        pode_gerenciar_alarmes=True
    )
    operador = Usuario(
        nome="Operador Comum",
        email="operador@smartfarm.com",
        senha_hash=get_password_hash("Senha123!"),
        eh_administrador=False,
        administrador_id=usuario_admin.id,
        pode_acessar_animais=True,
        pode_acessar_equipamentos=False,
        pode_acessar_estacoes=False,
        pode_gerenciar_alarmes=False
    )
    db_session.add_all([sub_admin, operador])
    db_session.commit()
    db_session.refresh(sub_admin)
    db_session.refresh(operador)

    headers_owner = _criar_headers(usuario_admin)
    headers_sub = _criar_headers(sub_admin)

    # 1. Sub-admin NÃO pode alterar o proprietário titular da conta -> 403
    res_edit_owner = client.put(
        f"/api/v1/usuarios/{usuario_admin.id}",
        json={"nome": "Tentativa deSequestro"},
        headers=headers_sub
    )
    assert res_edit_owner.status_code == 403

    # 2. Sub-admin NÃO pode promover operador comum a administrador -> 403
    res_promote = client.put(
        f"/api/v1/usuarios/{operador.id}",
        json={"eh_administrador": True},
        headers=headers_sub
    )
    assert res_promote.status_code == 403

    # 3. Sub-admin NÃO pode criar novo usuário já como administrador -> 403
    res_create_admin = client.post(
        "/api/v1/usuarios",
        json={
            "nome": "Novo Admin Ilegal",
            "email": "ilegal@smartfarm.com",
            "senha": "Password123!",
            "eh_administrador": True
        },
        headers=headers_sub
    )
    assert res_create_admin.status_code == 403

    # 4. Sub-admin PODE editar permissões de módulos de um operador comum -> 200
    res_edit_op = client.put(
        f"/api/v1/usuarios/{operador.id}",
        json={"pode_acessar_equipamentos": True},
        headers=headers_sub
    )
    assert res_edit_op.status_code == 200
    assert res_edit_op.json()["pode_acessar_equipamentos"] is True

    # 5. Sub-admin NÃO pode excluir o proprietário titular -> 403
    res_del_owner = client.delete(
        f"/api/v1/usuarios/{usuario_admin.id}",
        headers=headers_sub
    )
    assert res_del_owner.status_code == 403

    # 6. Proprietário titular NÃO pode remover seu próprio privilégio de administrador -> 400
    res_self_demote = client.put(
        f"/api/v1/usuarios/{usuario_admin.id}",
        json={"eh_administrador": False},
        headers=headers_owner
    )
    assert res_self_demote.status_code == 400


# =====================================================================
# ITEM 5 (A4): Detecção de IP Real atrás do Nginx e Rate Limiting
# =====================================================================

def _construir_request_falso(peer_ip: str, headers: dict[str, str]) -> Request:
    raw_headers = [(k.lower().encode("latin-1"), v.encode("latin-1")) for k, v in headers.items()]
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/v1/autenticacao/registro",
        "headers": raw_headers,
        "client": (peer_ip, 54321),
    }
    return Request(scope)


def test_obter_ip_cliente_proxy_confiavel_vs_externo():
    """Garante que X-Real-IP / X-Forwarded-For só sejam aceitos quando vierem de rede interna/proxy."""
    # Conexão vinda do container Nginx interno (172.18.0.5) com X-Real-IP
    req_nginx = _construir_request_falso("172.18.0.5", {"X-Real-IP": "198.51.100.25"})
    assert obter_ip_cliente(req_nginx) == "198.51.100.25"

    # Conexão vinda de loopback (127.0.0.1) com X-Forwarded-For
    req_xff = _construir_request_falso(
        "127.0.0.1",
        {"X-Forwarded-For": "198.51.100.10, 203.0.113.88"}
    )
    assert obter_ip_cliente(req_xff) == "203.0.113.88"

    # Conexão direta de IP externo tentando falsificar X-Real-IP -> ignora cabeçalho!
    req_spoof = _construir_request_falso(
        "203.0.113.200",
        {"X-Real-IP": "10.0.0.1", "X-Forwarded-For": "10.0.0.1"}
    )
    assert obter_ip_cliente(req_spoof) == "203.0.113.200"


def test_registration_rate_limit_isolates_ips(client):
    """Testa se o rate limit de registro contabiliza por IP real e bloqueia na 6ª tentativa."""
    from app.core.config import settings
    REGISTRATION_ATTEMPTS.clear()

    with patch.object(settings, "REGISTRATION_INVITE_CODE", ""), \
         patch("app.api.v1.auth.obter_ip_cliente", return_value="198.51.100.50"):
        for i in range(5):
            res = client.post(
                "/api/v1/autenticacao/registro",
                json={
                    "nome": f"Produtor {i}",
                    "email": f"produtor{i}@fazenda.com",
                    "senha": "Password123!"
                }
            )
            assert res.status_code == 201

        # 6ª tentativa do mesmo IP -> 429 Too Many Requests
        res_bloqueado = client.post(
            "/api/v1/autenticacao/registro",
            json={
                "nome": "Produtor 6",
                "email": "produtor6@fazenda.com",
                "senha": "Password123!"
            }
        )
        assert res_bloqueado.status_code == 429

    # Outro usuário vindo de outro IP externo deve conseguir registrar normalmente
    with patch.object(settings, "REGISTRATION_INVITE_CODE", ""), \
         patch("app.api.v1.auth.obter_ip_cliente", return_value="198.51.100.99"):
        res_outro_ip = client.post(
            "/api/v1/autenticacao/registro",
            json={
                "nome": "Outro Produtor",
                "email": "outro.ip@fazenda.com",
                "senha": "Password123!"
            }
        )
        assert res_outro_ip.status_code == 201

    REGISTRATION_ATTEMPTS.clear()


def test_property_management_permission_rbac(client, db_session, usuario_admin, poligono_fazenda):
    """
    Garante que colaboradores sem pode_gerenciar_propriedades (ex: Veterinário) não podem
    criar, editar ou excluir propriedades, enquanto colaboradores com a permissão habilitada podem.
    """
    from app.models import UsuarioPropriedade, Propriedade

    propriedade_padrao = Propriedade(
        usuario_id=usuario_admin.id,
        nome="Fazenda Base",
        descricao="Fazenda inicial",
        poligono_geojson=poligono_fazenda
    )
    db_session.add(propriedade_padrao)
    db_session.commit()
    db_session.refresh(propriedade_padrao)

    veterinario = Usuario(
        nome="Veterinário",
        email="vet@smartfarm.com",
        senha_hash=get_password_hash("Senha123!"),
        eh_administrador=False,
        administrador_id=usuario_admin.id,
        pode_gerenciar_propriedades=False,
        pode_acessar_animais=True,
        pode_acessar_equipamentos=False,
        pode_acessar_estacoes=False,
        pode_gerenciar_alarmes=True
    )
    gerente_fazenda = Usuario(
        nome="Gerente de Fazenda",
        email="gerente.prop@smartfarm.com",
        senha_hash=get_password_hash("Senha123!"),
        eh_administrador=False,
        administrador_id=usuario_admin.id,
        pode_gerenciar_propriedades=True,
        pode_acessar_animais=True,
        pode_acessar_equipamentos=True,
        pode_acessar_estacoes=True,
        pode_gerenciar_alarmes=True
    )
    db_session.add_all([veterinario, gerente_fazenda])
    db_session.commit()
    db_session.refresh(veterinario)
    db_session.refresh(gerente_fazenda)

    db_session.add_all([
        UsuarioPropriedade(usuario_id=veterinario.id, propriedade_id=propriedade_padrao.id),
        UsuarioPropriedade(usuario_id=gerente_fazenda.id, propriedade_id=propriedade_padrao.id),
    ])
    db_session.commit()

    headers_vet = _criar_headers(veterinario)
    headers_gerente = _criar_headers(gerente_fazenda)

    nova_prop_payload = {
        "nome": "Fazenda Nova",
        "descricao": "Teste de permissão",
        "poligono_geojson": {
            "type": "Polygon",
            "coordinates": [[
                [-23.50, -46.60],
                [-23.50, -46.62],
                [-23.52, -46.62],
                [-23.52, -46.60],
                [-23.50, -46.60]
            ]]
        }
    }

    # 1. Veterinário NÃO pode cadastrar, editar ou excluir propriedades -> 403
    assert client.post("/api/v1/propriedades/", json=nova_prop_payload, headers=headers_vet).status_code == 403
    assert client.put(
        f"/api/v1/propriedades/{propriedade_padrao.id}",
        json={"nome": "Tentativa Vet"},
        headers=headers_vet
    ).status_code == 403
    assert client.delete(f"/api/v1/propriedades/{propriedade_padrao.id}", headers=headers_vet).status_code == 403

    # 2. Gerente de Fazenda (não-admin com pode_gerenciar_propriedades=True) PODE criar e editar -> 201 / 200
    res_create = client.post("/api/v1/propriedades/", json=nova_prop_payload, headers=headers_gerente)
    assert res_create.status_code == 201
    nova_id = res_create.json()["id"]

    res_update = client.put(
        f"/api/v1/propriedades/{nova_id}",
        json={"nome": "Fazenda Nova Editada"},
        headers=headers_gerente
    )
    assert res_update.status_code == 200
    assert res_update.json()["nome"] == "Fazenda Nova Editada"


def test_collaborator_property_scoping(client, db_session, usuario_admin, poligono_fazenda):
    """
    Garante que quando um Administrador possui Fazenda A e Fazenda B e vincula um colaborador
    apenas à Fazenda A, o colaborador enxerga somente a Fazenda A e recebe 403 na Fazenda B.
    """
    from app.models import UsuarioPropriedade, Propriedade

    fazenda_a = Propriedade(
        usuario_id=usuario_admin.id,
        nome="Fazenda A (Autorizada)",
        descricao="Acesso liberado",
        poligono_geojson=poligono_fazenda
    )
    fazenda_b = Propriedade(
        usuario_id=usuario_admin.id,
        nome="Fazenda B (Restrita)",
        descricao="Acesso restrito",
        poligono_geojson=poligono_fazenda
    )
    db_session.add_all([fazenda_a, fazenda_b])
    db_session.commit()
    db_session.refresh(fazenda_a)
    db_session.refresh(fazenda_b)

    colaborador = Usuario(
        nome="Colaborador Fazenda A",
        email="colab.fazenda.a@smartfarm.com",
        senha_hash=get_password_hash("Senha123!"),
        eh_administrador=False,
        administrador_id=usuario_admin.id,
        pode_acessar_animais=True,
        pode_acessar_equipamentos=True,
        pode_acessar_estacoes=True,
        pode_gerenciar_alarmes=True
    )
    db_session.add(colaborador)
    db_session.commit()
    db_session.refresh(colaborador)

    # Vincula apenas à Fazenda A
    db_session.add(UsuarioPropriedade(usuario_id=colaborador.id, propriedade_id=fazenda_a.id))
    db_session.commit()

    headers_colab = _criar_headers(colaborador)

    # 1. GET /api/v1/propriedades retorna apenas a Fazenda A
    res_props = client.get("/api/v1/propriedades/", headers=headers_colab)
    assert res_props.status_code == 200
    ids_retornados = [p["id"] for p in res_props.json()]
    assert fazenda_a.id in ids_retornados
    assert fazenda_b.id not in ids_retornados

    # 2. Acesso a recursos da Fazenda A é permitido (200), mas na Fazenda B retorna 403 Forbidden
    assert client.get(f"/api/v1/animais/propriedade/{fazenda_a.id}", headers=headers_colab).status_code == 200
    assert client.get(f"/api/v1/animais/propriedade/{fazenda_b.id}", headers=headers_colab).status_code == 403


def test_module_permissions_enforcement(client, db_session, usuario_admin, poligono_fazenda):
    """
    Garante que usuários sem permissão para um módulo específico (Animais, Equipamentos,
    Estações Ambientais ou Alarmes) recebam 403 Forbidden nas rotas daquele módulo.
    """
    from app.models import UsuarioPropriedade, Propriedade, Animal, Equipamento, EstacaoAmbiental, Alerta

    prop = Propriedade(
        usuario_id=usuario_admin.id,
        nome="Fazenda Modulos",
        descricao="Teste de modulos",
        poligono_geojson=poligono_fazenda
    )
    db_session.add(prop)
    db_session.commit()
    db_session.refresh(prop)

    animal = Animal(propriedade_id=prop.id, numero_brinco="MOD-01", especie="Bovino", dispositivo_id="DEV_MOD_AN")
    equip = Equipamento(propriedade_id=prop.id, nome="Trator M", tipo="Trator", dispositivo_id="DEV_MOD_EQ")
    estacao = EstacaoAmbiental(propriedade_id=prop.id, nome="Estacao M", latitude=-21.1, longitude=-48.9, dispositivo_id="DEV_MOD_ST")
    alerta = Alerta(propriedade_id=prop.id, dispositivo_id="DEV_MOD_AN", tipo="FEBRE", severidade="ALTA", mensagem="Febre", esta_ativo=True)
    db_session.add_all([animal, equip, estacao, alerta])
    db_session.commit()
    for obj in (animal, equip, estacao, alerta):
        db_session.refresh(obj)

    sem_permissoes = Usuario(
        nome="Sem Modulos",
        email="sem.modulos@smartfarm.com",
        senha_hash=get_password_hash("Senha123!"),
        eh_administrador=False,
        administrador_id=usuario_admin.id,
        pode_acessar_animais=False,
        pode_acessar_equipamentos=False,
        pode_acessar_estacoes=False,
        pode_gerenciar_alarmes=False
    )
    db_session.add(sem_permissoes)
    db_session.commit()
    db_session.refresh(sem_permissoes)

    db_session.add(UsuarioPropriedade(usuario_id=sem_permissoes.id, propriedade_id=prop.id))
    db_session.commit()

    headers = _criar_headers(sem_permissoes)

    # Animais -> 403
    assert client.get(f"/api/v1/animais/propriedade/{prop.id}", headers=headers).status_code == 403
    assert client.post("/api/v1/animais/", json={"propriedade_id": prop.id, "numero_brinco": "X", "especie": "Bovino", "dispositivo_id": "X1"}, headers=headers).status_code == 403
    assert client.put(f"/api/v1/animais/{animal.id}", json={"raca": "Gir"}, headers=headers).status_code == 403
    assert client.delete(f"/api/v1/animais/{animal.id}", headers=headers).status_code == 403

    # Equipamentos -> 403
    assert client.get(f"/api/v1/equipamentos/propriedade/{prop.id}", headers=headers).status_code == 403
    assert client.post("/api/v1/equipamentos/", json={"propriedade_id": prop.id, "nome": "T", "tipo": "Trator", "dispositivo_id": "X2"}, headers=headers).status_code == 403
    assert client.put(f"/api/v1/equipamentos/{equip.id}", json={"modelo": "2026"}, headers=headers).status_code == 403
    assert client.delete(f"/api/v1/equipamentos/{equip.id}", headers=headers).status_code == 403

    # Estações Ambientais -> 403
    assert client.get(f"/api/v1/estacoes-ambientais/propriedade/{prop.id}", headers=headers).status_code == 403
    assert client.post("/api/v1/estacoes-ambientais/", json={"propriedade_id": prop.id, "nome": "E", "latitude": -21.0, "longitude": -48.0, "dispositivo_id": "X3"}, headers=headers).status_code == 403
    assert client.put(f"/api/v1/estacoes-ambientais/{estacao.id}", json={"nome": "E2"}, headers=headers).status_code == 403
    assert client.delete(f"/api/v1/estacoes-ambientais/{estacao.id}", headers=headers).status_code == 403

    # Reconhecer Alarme -> 403
    assert client.put(f"/api/v1/alertas/{alerta.id}/reconhecer", headers=headers).status_code == 403


def test_alarm_lifecycle_and_filtering(client, db_session, usuario_admin, headers_admin, poligono_fazenda):
    """
    Testa o ciclo completo de alertas: listagem apenas_ativos=true, reconhecimento do alerta
    e consulta do histórico completo com apenas_ativos=false.
    """
    from app.models import Propriedade, Alerta

    prop = Propriedade(
        usuario_id=usuario_admin.id,
        nome="Fazenda Alertas",
        descricao="Ciclo de alertas",
        poligono_geojson=poligono_fazenda
    )
    db_session.add(prop)
    db_session.commit()
    db_session.refresh(prop)

    alerta = Alerta(
        propriedade_id=prop.id,
        dispositivo_id="DEV_ALARM_01",
        tipo="CERCA_VIRTUAL",
        severidade="CRITICA",
        mensagem="Animal fora da cerca",
        esta_ativo=True
    )
    db_session.add(alerta)
    db_session.commit()
    db_session.refresh(alerta)

    # 1. Lista alertas ativos -> contém 1 alerta
    res_ativos = client.get(f"/api/v1/alertas/propriedade/{prop.id}?apenas_ativos=true", headers=headers_admin)
    assert res_ativos.status_code == 200
    assert len(res_ativos.json()) == 1
    assert res_ativos.json()[0]["id"] == alerta.id

    # 2. Reconhece / desativa o alerta
    res_ack = client.put(f"/api/v1/alertas/{alerta.id}/reconhecer", headers=headers_admin)
    assert res_ack.status_code == 200
    assert res_ack.json()["esta_ativo"] is False

    # 3. Lista alertas ativos novamente -> vazio
    res_ativos_apos = client.get(f"/api/v1/alertas/propriedade/{prop.id}?apenas_ativos=true", headers=headers_admin)
    assert res_ativos_apos.status_code == 200
    assert len(res_ativos_apos.json()) == 0

    # 4. Lista histórico incluindo resolvidos (apenas_ativos=false) -> retorna o alerta reconhecido
    res_historico = client.get(f"/api/v1/alertas/propriedade/{prop.id}?apenas_ativos=false", headers=headers_admin)
    assert res_historico.status_code == 200
    assert len(res_historico.json()) == 1
    assert res_historico.json()[0]["esta_ativo"] is False


def test_delete_telemetry_history_isolation(client, db_session, usuario_admin, headers_admin, poligono_fazenda):
    """
    Garante que DELETE /api/v1/telemetria/historico/{dispositivo_id} apaga apenas as medições
    do dispositivo autorizado e bloqueia (404) tentativas de apagar dispositivos de terceiros.
    """
    from unittest.mock import MagicMock
    from app.models import Propriedade, Animal

    prop_a = Propriedade(usuario_id=usuario_admin.id, nome="Fazenda A", poligono_geojson=poligono_fazenda)
    db_session.add(prop_a)
    db_session.commit()
    db_session.refresh(prop_a)

    animal_a = Animal(propriedade_id=prop_a.id, numero_brinco="HIST-01", especie="Bovino", dispositivo_id="DEV_HIST_A")
    db_session.add(animal_a)
    db_session.commit()

    outro_dono = Usuario(
        nome="Outro Dono",
        email="outro.dono.hist@smartfarm.com",
        senha_hash=get_password_hash("Senha123!"),
        eh_administrador=True
    )
    db_session.add(outro_dono)
    db_session.commit()
    db_session.refresh(outro_dono)

    headers_outro = _criar_headers(outro_dono)

    mock_collection = MagicMock()
    mock_result = MagicMock()
    mock_result.deleted_count = 3
    mock_collection.delete_many.return_value = mock_result

    with patch("app.api.v1.telemetry.mongo_db", new={"telemetria_animais": mock_collection, "animal_telemetry": mock_collection, "telemetria_equipamentos": mock_collection, "equipment_telemetry": mock_collection, "telemetria_estacoes": mock_collection, "environment_telemetry": mock_collection}):
        # 1. Outro dono tentando apagar histórico do dispositivo da Fazenda A -> 404
        res_bloqueado = client.delete("/api/v1/telemetria/historico/DEV_HIST_A", headers=headers_outro)
        assert res_bloqueado.status_code == 404
        mock_collection.delete_many.assert_not_called()

        # 2. Dono legítimo apagando histórico -> 200 OK
        res_ok = client.delete("/api/v1/telemetria/historico/DEV_HIST_A", headers=headers_admin)
        assert res_ok.status_code == 200
        assert res_ok.json()["dispositivo_id"] == "DEV_HIST_A"
        assert res_ok.json()["total_removido"] == 18


def test_mqtt_subscriber_closes_db_session_on_error():
    """
    Garante que o subscriber MQTT sempre executa db.rollback() e db.close()
    no bloco finally mesmo quando ocorre uma exceção inesperada durante o processamento.
    """
    import json
    from unittest.mock import MagicMock
    from app.services import mqtt_subscriber

    mock_db = MagicMock()
    mock_db.query.side_effect = RuntimeError("Falha simulada de banco de dados")

    mock_msg = MagicMock()
    mock_msg.topic = "fazenda/telemetria/animal/DEV_ERR_01"
    mock_msg.payload = json.dumps({
        "dispositivo_id": "DEV_ERR_01",
        "temperatura_corporal": 40.2,
        "latitude": -21.22,
        "longitude": -44.99
    }).encode("utf-8")

    mock_collection = MagicMock()
    with patch.object(mqtt_subscriber, "SessionLocal", return_value=mock_db), \
         patch.object(mqtt_subscriber, "mongo_db", new={"telemetria_animais": mock_collection, "animal_telemetry": mock_collection}):
        mqtt_subscriber.on_message(None, None, mock_msg)

    mock_db.rollback.assert_called_once()
    mock_db.close.assert_called_once()


def test_mongodb_indexes_and_no_duplicate_writes():
    """
    Garante que garantir_indices_mongodb cria os índices compostos nas 3 coleções principais
    e que o subscriber MQTT não duplica gravações nas coleções legadas em inglês.
    """
    import json
    from unittest.mock import MagicMock
    from app.core import database
    from app.services import mqtt_subscriber

    mock_cols = {
        "telemetria_animais": MagicMock(),
        "animal_telemetry": MagicMock(),
        "telemetria_equipamentos": MagicMock(),
        "equipment_telemetry": MagicMock(),
        "telemetria_estacoes": MagicMock(),
        "environment_telemetry": MagicMock(),
    }

    with patch.object(database, "mongo_db", mock_cols):
        database.garantir_indices_mongodb()

    for nome_col in ("telemetria_animais", "telemetria_equipamentos", "telemetria_estacoes"):
        mock_cols[nome_col].create_index.assert_any_call([("dispositivo_id", 1), ("data_hora", -1)])
        mock_cols[nome_col].create_index.assert_any_call([("data_hora", -1)])

    mock_db_sql = MagicMock()
    mock_db_sql.query.return_value.filter.return_value.first.return_value = MagicMock(propriedade_id=1, propriedade=None)
    mock_msg = MagicMock()
    mock_msg.topic = "fazenda/telemetria/animal/DEV_NO_DUP_01"
    mock_msg.payload = json.dumps({"dispositivo_id": "DEV_NO_DUP_01", "temperatura_corporal": 38.5}).encode("utf-8")

    with patch.object(mqtt_subscriber, "SessionLocal", return_value=mock_db_sql), \
         patch.object(mqtt_subscriber, "mongo_db", mock_cols):
        mqtt_subscriber.on_message(None, None, mock_msg)

    mock_cols["telemetria_animais"].insert_many.assert_called_once()
    mock_cols["animal_telemetry"].insert_many.assert_not_called()


def test_telemetry_status_real_mqtt_and_tenant_scoping(client, db_session, usuario_admin, headers_admin, poligono_fazenda):
    """
    Garante que /api/v1/telemetria/status reflete o estado real do broker MQTT (online/offline)
    e contabiliza apenas os sensores pertencentes às propriedades do usuário autenticado.
    """
    from unittest.mock import MagicMock
    from app.models import Propriedade, Animal

    prop_a = Propriedade(usuario_id=usuario_admin.id, nome="Fazenda Status A", poligono_geojson=poligono_fazenda)
    db_session.add(prop_a)
    db_session.commit()
    db_session.refresh(prop_a)

    animal_a = Animal(propriedade_id=prop_a.id, numero_brinco="ST-01", especie="Bovino", dispositivo_id="DEV_ST_A")
    db_session.add(animal_a)
    db_session.commit()

    outro_usuario = Usuario(
        nome="Usuario Sem Sensores",
        email="sem.sensores@smartfarm.com",
        senha_hash=get_password_hash("Senha123!"),
        eh_administrador=True
    )
    db_session.add(outro_usuario)
    db_session.commit()
    db_session.refresh(outro_usuario)
    headers_outro = _criar_headers(outro_usuario)

    mock_anim_col = MagicMock()
    mock_anim_col.find_one.return_value = {"dispositivo_id": "DEV_ST_A", "data_hora": "2026-10-16T20:00:00Z"}
    mock_anim_col.distinct.return_value = ["DEV_ST_A"]
    mock_empty_col = MagicMock()
    mock_empty_col.find_one.return_value = None
    mock_empty_col.distinct.return_value = []

    fake_mongo = {
        "telemetria_animais": mock_anim_col,
        "telemetria_equipamentos": mock_empty_col,
        "telemetria_estacoes": mock_empty_col,
    }

    with patch("app.api.v1.telemetry.mongo_db", fake_mongo):
        # 1. Broker MQTT online + usuario_admin (dono de DEV_ST_A) -> 1 sensor ativo
        with patch("app.api.v1.telemetry.verificar_status_broker_mqtt", return_value=True):
            res_online = client.get("/api/v1/telemetria/status", headers=headers_admin)
            assert res_online.status_code == 200
            dados_online = res_online.json()
            assert dados_online["status"] == "online"
            assert dados_online["broker_mqtt"] == "online"
            assert dados_online["sensores_ativos"] == 1

            # 2. Outro usuário sem dispositivos cadastrados -> 0 sensores ativos (isolamento multi-tenant)
            res_outro = client.get("/api/v1/telemetria/status", headers=headers_outro)
            assert res_outro.status_code == 200
            assert res_outro.json()["sensores_ativos"] == 0

        # 3. Broker MQTT offline -> status degradado e broker_mqtt offline
        with patch("app.api.v1.telemetry.verificar_status_broker_mqtt", return_value=False):
            res_offline = client.get("/api/v1/telemetria/status", headers=headers_admin)
            assert res_offline.status_code == 200
            dados_offline = res_offline.json()
            assert dados_offline["status"] == "degradado"
            assert dados_offline["broker_mqtt"] == "offline"


def test_same_device_id_across_accounts_and_mqtt_email_validation(client, db_session, poligono_fazenda):
    """
    Garante que:
    1. Dois usuários de contas distintas (rodrigo@mail.com e joao@mail.com) podem cadastrar
       dispositivos com o mesmo nome ('Animal1') e mesmo brinco ('01') sem conflito.
    2. A mesma conta continua impedida de duplicar 'Animal1' ou brinco '01'.
    3. No MQTT, se o dispositivo enviar um usuario_email inexistente (ex: 'rodrigo1@gmail.com'),
       a telemetria é rejeitada (não grava no MongoDB) e um erro CONTA_NAO_ENCONTRADA é publicado.
    4. Quando o usuario_email é válido, cada pacote é gravado no MongoDB vinculado ao propriedade_id
       correto de Rodrigo ou de João.
    """
    import json
    from unittest.mock import MagicMock
    from app.models import Propriedade
    from app.services import mqtt_subscriber

    rodrigo = Usuario(
        nome="Rodrigo",
        email="rodrigo@mail.com",
        senha_hash=get_password_hash("Senha123!"),
        eh_administrador=True
    )
    joao = Usuario(
        nome="Joao",
        email="joao@mail.com",
        senha_hash=get_password_hash("Senha123!"),
        eh_administrador=True
    )
    db_session.add_all([rodrigo, joao])
    db_session.commit()
    db_session.refresh(rodrigo)
    db_session.refresh(joao)

    prop_rodrigo = Propriedade(usuario_id=rodrigo.id, nome="Fazenda Rodrigo", poligono_geojson=poligono_fazenda)
    prop_joao = Propriedade(usuario_id=joao.id, nome="Fazenda Joao", poligono_geojson=poligono_fazenda)
    db_session.add_all([prop_rodrigo, prop_joao])
    db_session.commit()
    db_session.refresh(prop_rodrigo)
    db_session.refresh(prop_joao)

    headers_rodrigo = _criar_headers(rodrigo)
    headers_joao = _criar_headers(joao)

    # 1. Rodrigo cadastra 'Animal1' com brinco '01' -> 201 Created
    res_r = client.post(
        "/api/v1/animais/",
        headers=headers_rodrigo,
        json={
            "propriedade_id": prop_rodrigo.id,
            "numero_brinco": "01",
            "especie": "Bovino",
            "dispositivo_id": "Animal1",
        },
    )
    assert res_r.status_code == 201, res_r.text

    # 2. João cadastra 'Animal1' com brinco '01' na conta dele -> 201 Created (sem conflito global!)
    res_j = client.post(
        "/api/v1/animais/",
        headers=headers_joao,
        json={
            "propriedade_id": prop_joao.id,
            "numero_brinco": "01",
            "especie": "Bovino",
            "dispositivo_id": "Animal1",
        },
    )
    assert res_j.status_code == 201, res_j.text

    # 3. Rodrigo tenta cadastrar outro 'Animal1' na própria conta -> 400 Bad Request
    res_dup = client.post(
        "/api/v1/animais/",
        headers=headers_rodrigo,
        json={
            "propriedade_id": prop_rodrigo.id,
            "numero_brinco": "02",
            "especie": "Bovino",
            "dispositivo_id": "Animal1",
        },
    )
    assert res_dup.status_code == 400

    # 4. MQTT com conta inexistente (ex: erro de digitação 'rodrigo1@gmail.com') -> rejeita e publica erro
    mock_anim_col = MagicMock()
    mock_cols = {"telemetria_animais": mock_anim_col}
    mock_client = MagicMock()

    msg_invalida = MagicMock()
    msg_invalida.topic = "fazenda/telemetria/animal/Animal1"
    msg_invalida.payload = json.dumps({
        "dispositivo_id": "Animal1",
        "usuario_email": "rodrigo1@gmail.com",
        "temperatura_corporal": 38.5
    }).encode("utf-8")

    # Evita que SessionLocal.close() feche a sessão de teste compartilhada
    with patch.object(db_session, "close"), \
         patch.object(mqtt_subscriber, "SessionLocal", return_value=db_session), \
         patch.object(mqtt_subscriber, "mongo_db", mock_cols):
        mqtt_subscriber.on_message(mock_client, None, msg_invalida)

    mock_anim_col.insert_many.assert_not_called()
    mock_client.publish.assert_called_once()
    topico_erro, payload_erro = mock_client.publish.call_args[0][0], json.loads(mock_client.publish.call_args[0][1])
    assert topico_erro == "fazenda/configuracao/animal/Animal1"
    assert payload_erro["erro"] == "CONTA_NAO_ENCONTRADA"

    # 5. MQTT válido de Rodrigo e de João roteiam para os respectivos propriedade_id no MongoDB
    msg_rodrigo = MagicMock()
    msg_rodrigo.topic = "fazenda/telemetria/animal/Animal1"
    msg_rodrigo.payload = json.dumps({
        "dispositivo_id": "Animal1",
        "usuario_email": "rodrigo@mail.com",
        "temperatura_corporal": 38.4
    }).encode("utf-8")

    msg_joao = MagicMock()
    msg_joao.topic = "fazenda/telemetria/animal/Animal1"
    msg_joao.payload = json.dumps({
        "dispositivo_id": "Animal1",
        "usuario_email": "joao@mail.com",
        "temperatura_corporal": 39.1
    }).encode("utf-8")

    with patch.object(db_session, "close"), \
         patch.object(mqtt_subscriber, "SessionLocal", return_value=db_session), \
         patch.object(mqtt_subscriber, "mongo_db", mock_cols):
        mqtt_subscriber.on_message(mock_client, None, msg_rodrigo)
        mqtt_subscriber.on_message(mock_client, None, msg_joao)

    assert mock_anim_col.insert_many.call_count == 2
    doc_rodrigo = mock_anim_col.insert_many.call_args_list[0][0][0][0]
    doc_joao = mock_anim_col.insert_many.call_args_list[1][0][0][0]
    assert doc_rodrigo["propriedade_id"] == prop_rodrigo.id
    assert doc_joao["propriedade_id"] == prop_joao.id


def test_login_rate_limiting_by_email_and_ip(client, usuario_admin):
    """Garante bloqueio contra força bruta no /login por e-mail (5 falhas) e por IP (10 falhas)."""
    from app.api.v1 import auth as auth_module

    auth_module.LOGIN_ATTEMPTS_IP.clear()
    auth_module.LOGIN_ATTEMPTS_EMAIL.clear()

    # 1. Simula 5 falhas contra o mesmo e-mail (mesmo variando IP via X-Real-IP em proxy confiável)
    for idx in range(auth_module.MAX_LOGIN_ATTEMPTS_PER_EMAIL):
        res = client.post(
            "/api/v1/autenticacao/login",
            data={"username": usuario_admin.email, "password": f"errada_{idx}"},
        )
        assert res.status_code == 401

    # 6ª tentativa contra o mesmo e-mail deve ser bloqueada com 429
    res_bloqueado_email = client.post(
        "/api/v1/autenticacao/login",
        data={"username": usuario_admin.email, "password": "SenhaIncorreta123!"},
    )
    assert res_bloqueado_email.status_code == 429
    assert "Retry-After" in res_bloqueado_email.headers

    # 2. Limpa e verifica que um IP atacando vários e-mails distintos é bloqueado na 11ª tentativa
    auth_module.LOGIN_ATTEMPTS_IP.clear()
    auth_module.LOGIN_ATTEMPTS_EMAIL.clear()

    for idx in range(auth_module.MAX_LOGIN_ATTEMPTS_PER_IP):
        res = client.post(
            "/api/v1/autenticacao/login",
            data={"username": f"alvo_{idx}@fazenda.com", "password": "123"},
        )
        assert res.status_code == 401

    res_bloqueado_ip = client.post(
        "/api/v1/autenticacao/login",
        data={"username": "outro_alvo@fazenda.com", "password": "123"},
    )
    assert res_bloqueado_ip.status_code == 429

    # Limpa estado para não afetar outros testes
    auth_module.LOGIN_ATTEMPTS_IP.clear()
    auth_module.LOGIN_ATTEMPTS_EMAIL.clear()





