from datetime import timedelta
from jose import jwt
from app.core.config import settings
from app.core.security import (
    get_password_hash,
    verify_password,
    create_access_token
)

def test_password_hash_generation():
    """Gera hash e valida que ele é diferente do texto plano."""
    senha = "MinhaSenhaSegura123!"
    hash_senha = get_password_hash(senha)
    assert hash_senha != senha
    assert hash_senha.startswith("$2b$") or hash_senha.startswith("$2a$")

def test_password_verification_success():
    """Verifica que a senha correta valida com sucesso."""
    senha = "SenhaCorreta2026@"
    hash_senha = get_password_hash(senha)
    assert verify_password(senha, hash_senha) is True

def test_password_verification_failure():
    """Verifica que senha incorreta é rejeitada."""
    senha = "SenhaCorreta2026@"
    senha_errada = "SenhaIncorreta2026@"
    hash_senha = get_password_hash(senha)
    assert verify_password(senha_errada, hash_senha) is False

def test_password_truncation_72_bytes():
    """Valida comportamento com senhas longas (> 72 bytes)."""
    senha_longa = "A" * 100
    hash_senha = get_password_hash(senha_longa)
    assert verify_password(senha_longa, hash_senha) is True
    # Primeiros 72 caracteres devem coincidir
    assert verify_password(senha_longa[:72], hash_senha) is True

def test_jwt_token_creation_and_payload():
    """Valida geração de JWT e decodificação do subject (sub)."""
    email_teste = "usuario.teste@smartfarm.com"
    token = create_access_token(subject=email_teste)
    assert isinstance(token, str)
    assert len(token) > 20

    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    assert payload.get("sub") == email_teste
    assert "exp" in payload

def test_jwt_token_custom_expiration():
    """Valida criação de token com delta de expiração personalizado."""
    email_teste = "expiracao@smartfarm.com"
    delta = timedelta(minutes=5)
    token = create_access_token(subject=email_teste, expires_delta=delta)

    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    assert payload.get("sub") == email_teste

