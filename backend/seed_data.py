"""
Script de Carga Inicial (Seed Data) para o Sistema de Gestao Rural IoT.
Cria o usuario administrador, as propriedades (Catanduva e Mato Grosso),
os animais com sensores, os equipamentos, as estacoes ambientais e os colaboradores com RBAC.
"""
from app.core.database import SessionLocal, engine, Base
from app.core.security import get_password_hash
from app.models import Usuario, Propriedade, Animal, Equipamento, EstacaoAmbiental, Alerta, UsuarioPropriedade

def seed():
    print("[INFO] Recriando tabelas no PostgreSQL...", flush=True)
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print("[OK] Tabelas criadas com sucesso!", flush=True)

    db = SessionLocal()
    try:
        # 1. Usuario Administrador Geral (Dono de todas as fazendas)
        admin = Usuario(
            nome="Administrador Geral",
            email="admin@smartfarm.com",
            senha_hash=get_password_hash("admin123"),
            eh_administrador=True,
            pode_acessar_animais=True,
            pode_acessar_equipamentos=True,
            pode_acessar_estacoes=True,
            pode_gerenciar_alarmes=True
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
        print("[OK] Usuario Administrador 'admin@smartfarm.com' (senha: 'admin123') criado!", flush=True)

        # 2. Propriedade 1: Fazenda Catanduva - SP
        poligono_catanduva = {
            "type": "Polygon",
            "coordinates": [[
                [-21.1320, -48.9780],
                [-21.1320, -48.9680],
                [-21.1420, -48.9680],
                [-21.1420, -48.9780]
            ]]
        }
        fazenda_catanduva = Propriedade(
            usuario_id=admin.id,
            nome="Fazenda Santa Maria (Catanduva/SP)",
            descricao="Propriedade modelo com gado de corte, monitoramento animal e estacoes agroambientais.",
            poligono_geojson=poligono_catanduva
        )
        db.add(fazenda_catanduva)

        # 3. Propriedade 2: Fazenda Mato Grosso
        poligono_matogrosso = {
            "type": "Polygon",
            "coordinates": [[
                [-14.5000, -56.5000],
                [-14.5000, -56.4000],
                [-14.6000, -56.4000],
                [-14.6000, -56.5000]
            ]]
        }
        fazenda_matogrosso = Propriedade(
            usuario_id=admin.id,
            nome="Fazenda Pantanal (Mato Grosso)",
            descricao="Propriedade de grande extensao com foco em maquinario pesado e lavoura intensiva.",
            poligono_geojson=poligono_matogrosso
        )
        db.add(fazenda_matogrosso)
        db.commit()
        db.refresh(fazenda_catanduva)
        db.refresh(fazenda_matogrosso)
        print(f"[OK] Fazendas cadastradas: '{fazenda_catanduva.nome}' e '{fazenda_matogrosso.nome}'!", flush=True)

        # 4. Colaboradores com RBAC (Cenário do Usuário)
        # 4.1 Colaborador de Catanduva (Acessa apenas Catanduva; animais e estacoes; sem acesso a maquinario)
        op_catanduva = Usuario(
            nome="Carlos - Operador Catanduva",
            email="operador.catanduva@smartfarm.com",
            senha_hash=get_password_hash("admin123"),
            eh_administrador=False,
            pode_acessar_animais=True,
            pode_acessar_equipamentos=False,
            pode_acessar_estacoes=True,
            pode_gerenciar_alarmes=True,
            administrador_id=admin.id
        )
        db.add(op_catanduva)
        db.commit()
        db.refresh(op_catanduva)
        # Vincula apenas a Catanduva
        db.add(UsuarioPropriedade(usuario_id=op_catanduva.id, propriedade_id=fazenda_catanduva.id))

        # 4.2 Colaborador do Mato Grosso (Acessa apenas Mato Grosso; equipamentos e maquinas)
        op_matogrosso = Usuario(
            nome="Marcos - Gerente Mato Grosso",
            email="operador.matogrosso@smartfarm.com",
            senha_hash=get_password_hash("admin123"),
            eh_administrador=False,
            pode_acessar_animais=True,
            pode_acessar_equipamentos=True,
            pode_acessar_estacoes=False,
            pode_gerenciar_alarmes=False,
            administrador_id=admin.id
        )
        db.add(op_matogrosso)
        db.commit()
        db.refresh(op_matogrosso)
        # Vincula apenas ao Mato Grosso
        db.add(UsuarioPropriedade(usuario_id=op_matogrosso.id, propriedade_id=fazenda_matogrosso.id))
        db.commit()
        print("[OK] Colaboradores cadastrados com isolamento de fazenda e permissoes granulares!", flush=True)

        # 5. Animais em Catanduva
        animais = [
            Animal(propriedade_id=fazenda_catanduva.id, numero_brinco="BR-1001", especie="Bovino", raca="Nelore", dispositivo_id="ANIMAL_BOV_001", intervalo_gps_segundos=10, intervalo_envio_segundos=5),
            Animal(propriedade_id=fazenda_catanduva.id, numero_brinco="BR-1002", especie="Bovino", raca="Angus", dispositivo_id="ANIMAL_BOV_002", intervalo_gps_segundos=30, intervalo_envio_segundos=10),
            Animal(propriedade_id=fazenda_catanduva.id, numero_brinco="BR-1003", especie="Bovino", raca="Nelore", dispositivo_id="ANIMAL_BOV_003", intervalo_gps_segundos=60, intervalo_envio_segundos=15),
        ]
        db.add_all(animais)

        # 6. Equipamentos em Catanduva
        equipamentos = [
            Equipamento(propriedade_id=fazenda_catanduva.id, nome="Trator John Deere 7230J", tipo="Trator", modelo="7230J", dispositivo_id="EQUIP_TRAC_01"),
            Equipamento(propriedade_id=fazenda_catanduva.id, nome="Colheitadeira S700", tipo="Colheitadeira", modelo="S700", dispositivo_id="EQUIP_COLH_01"),
        ]
        db.add_all(equipamentos)

        # 7. Estacoes Ambientais em Catanduva
        estacoes = [
            EstacaoAmbiental(propriedade_id=fazenda_catanduva.id, nome="Estacao Meteorologica Campo Norte", latitude=-21.1340, longitude=-48.9720, dispositivo_id="ENV_STATION_01"),
            EstacaoAmbiental(propriedade_id=fazenda_catanduva.id, nome="Estacao Solo Pastagem Sul", latitude=-21.1390, longitude=-48.9750, dispositivo_id="ENV_STATION_02"),
        ]
        db.add_all(estacoes)
        db.commit()

        print("\n[SUCESSO] Base de dados inicializada com RBAC e Multi-Fazendas!", flush=True)
    except Exception as e:
        print(f"[ERRO] Falha ao popular banco de dados: {e}", flush=True)
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed()
