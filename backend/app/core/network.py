import ipaddress
from fastapi import Request


_REDES_INTERNAS = (
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
)


def _eh_ip_interno(ip: str) -> bool:
    """True para loopback e redes locais RFC 1918/ULA (ex.: rede interna do Docker onde roda o Nginx)."""
    try:
        endereco = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(endereco in rede for rede in _REDES_INTERNAS)


def obter_ip_cliente(request: Request) -> str:
    """
    Retorna o IP real do cliente.

    Atrás do Nginx, `request.client.host` é sempre o IP do contêiner do proxy, o que faria todos
    os visitantes compartilharem o mesmo contador de rate limit. Por isso lemos o cabeçalho que o
    Nginx define, mas SOMENTE quando a conexão vem de um IP interno. Uma conexão direta de um IP
    público não pode forjar o cabeçalho para escapar do limite.

    O Nginx define `X-Real-IP` com `$remote_addr`, sobrescrevendo qualquer valor enviado pelo cliente.
    Como alternativa usamos o último item de `X-Forwarded-For`, que é o adicionado pelo próprio Nginx.
    """
    peer = request.client.host if request.client else "unknown"
    if not _eh_ip_interno(peer):
        return peer

    real_ip = request.headers.get("x-real-ip", "").strip()
    if real_ip:
        try:
            ipaddress.ip_address(real_ip)
            return real_ip
        except ValueError:
            pass

    encaminhado = request.headers.get("x-forwarded-for", "")
    if encaminhado:
        ultimo = encaminhado.split(",")[-1].strip()
        try:
            ipaddress.ip_address(ultimo)
            return ultimo
        except ValueError:
            pass

    return peer

