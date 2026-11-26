from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api import deps
from app.core import security
from app.models import Usuario, UsuarioPropriedade, Propriedade
from app.schemas import (
    UsuarioColaboradorCriacao,
    UsuarioColaboradorAtualizacao,
    UsuarioResposta,
)

router = APIRouter()

def _usuario_para_resposta(u: Usuario, db: Session) -> UsuarioResposta:
    if u.eh_administrador:
        admin_id = u.id if u.administrador_id is None else u.administrador_id
        props_ids = [p.id for p in db.query(Propriedade).filter(Propriedade.usuario_id == admin_id).all()]
    else:
        props_ids = [up.propriedade_id for up in u.propriedades_associadas]

    res = UsuarioResposta.model_validate(u)
    res.propriedades_ids = props_ids
    return res

@router.get("/", response_model=List[UsuarioResposta])
def listar_colaboradores(
    db: Session = Depends(deps.get_db),
    usuario_atual: Usuario = Depends(deps.get_current_user)
):
    """
    Lista todos os colaboradores vinculados à conta do administrador autenticado.
    """
    if not usuario_atual.eh_administrador:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem visualizar a lista de usuários e equipe."
        )

    # Administrador principal ou delegado: busca colaboradores criados por ele ou por sua conta
    admin_id = usuario_atual.id if usuario_atual.administrador_id is None else usuario_atual.administrador_id

    colaboradores = db.query(Usuario).filter(
        (Usuario.administrador_id == admin_id) | (Usuario.id == admin_id)
    ).order_by(Usuario.id.asc()).all()

    return [_usuario_para_resposta(u, db) for u in colaboradores]

@router.post("/", response_model=UsuarioResposta, status_code=status.HTTP_201_CREATED)
def criar_colaborador(
    dados_in: UsuarioColaboradorCriacao,
    db: Session = Depends(deps.get_db),
    usuario_atual: Usuario = Depends(deps.get_current_user)
):
    """
    Cadastra um novo colaborador com permissões personalizadas e vínculo às fazendas autorizadas.
    """
    if not usuario_atual.eh_administrador:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem cadastrar novos membros na equipe."
        )

    # Somente o proprietário da conta (sem administrador_id) pode conceder perfil de administrador
    if dados_in.eh_administrador and usuario_atual.administrador_id is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas o proprietário da conta pode conceder o perfil de administrador."
        )

    # Verifica duplicidade de e-mail
    existente = db.query(Usuario).filter(Usuario.email == dados_in.email).first()
    if existente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Já existe um usuário cadastrado com este e-mail."
        )

    admin_id = usuario_atual.id if usuario_atual.administrador_id is None else usuario_atual.administrador_id

    # Cria o novo usuário
    novo_usuario = Usuario(
        nome=dados_in.nome,
        email=dados_in.email,
        senha_hash=security.get_password_hash(dados_in.senha),
        eh_administrador=dados_in.eh_administrador,
        pode_acessar_animais=dados_in.pode_acessar_animais,
        pode_acessar_equipamentos=dados_in.pode_acessar_equipamentos,
        pode_acessar_estacoes=dados_in.pode_acessar_estacoes,
        pode_gerenciar_alarmes=dados_in.pode_gerenciar_alarmes,
        pode_gerenciar_propriedades=True if dados_in.eh_administrador else dados_in.pode_gerenciar_propriedades,
        administrador_id=admin_id
    )
    db.add(novo_usuario)
    db.commit()
    db.refresh(novo_usuario)

    # Associa propriedades
    if dados_in.propriedades_ids:
        # Filtra apenas propriedades que pertencem a este administrador
        props_validas = db.query(Propriedade.id).filter(
            Propriedade.id.in_(dados_in.propriedades_ids),
            Propriedade.usuario_id == admin_id
        ).all()
        ids_validos = [p[0] for p in props_validas]

        for p_id in ids_validos:
            vinculo = UsuarioPropriedade(
                usuario_id=novo_usuario.id,
                propriedade_id=p_id
            )
            db.add(vinculo)
        db.commit()
        db.refresh(novo_usuario)

    return _usuario_para_resposta(novo_usuario, db)

@router.put("/{usuario_id}", response_model=UsuarioResposta)
def atualizar_colaborador(
    usuario_id: int,
    dados_in: UsuarioColaboradorAtualizacao,
    db: Session = Depends(deps.get_db),
    usuario_atual: Usuario = Depends(deps.get_current_user)
):
    """
    Atualiza dados, permissões e propriedades vinculadas a um colaborador.
    """
    if not usuario_atual.eh_administrador:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem alterar permissões de usuários."
        )

    admin_id = usuario_atual.id if usuario_atual.administrador_id is None else usuario_atual.administrador_id

    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado.")

    # Impede alterar usuários fora da organização do administrador
    if usuario.administrador_id != admin_id and usuario.id != admin_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Você não tem permissão para gerenciar este usuário."
        )

    eh_dono = usuario_atual.administrador_id is None

    if not eh_dono:
        # Administrador delegado nunca pode alterar o proprietário da conta
        if usuario.id == admin_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Apenas o proprietário da conta pode alterar os dados do proprietário."
            )
        # Nem outros administradores (apenas a si mesmo)
        if usuario.eh_administrador and usuario.id != usuario_atual.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Apenas o proprietário da conta pode alterar outros administradores."
            )
        # Nem conceder ou revogar o perfil de administrador
        if dados_in.eh_administrador is not None and dados_in.eh_administrador != usuario.eh_administrador:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Apenas o proprietário da conta pode conceder ou revogar o perfil de administrador."
            )

    # Evita que o proprietário se rebaixe e deixe a conta sem administrador
    if usuario.id == admin_id and dados_in.eh_administrador is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O proprietário da conta não pode remover o próprio perfil de administrador."
        )

    if dados_in.nome is not None:
        usuario.nome = dados_in.nome
    if dados_in.email is not None:
        # Verifica se e-mail já existe em outro usuário
        outro = db.query(Usuario).filter(Usuario.email == dados_in.email, Usuario.id != usuario_id).first()
        if outro:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="E-mail já utilizado por outro usuário.")
        usuario.email = dados_in.email
    if dados_in.senha:
        usuario.senha_hash = security.get_password_hash(dados_in.senha)
    if dados_in.eh_administrador is not None:
        usuario.eh_administrador = dados_in.eh_administrador
    if dados_in.pode_acessar_animais is not None:
        usuario.pode_acessar_animais = dados_in.pode_acessar_animais
    if dados_in.pode_acessar_equipamentos is not None:
        usuario.pode_acessar_equipamentos = dados_in.pode_acessar_equipamentos
    if dados_in.pode_acessar_estacoes is not None:
        usuario.pode_acessar_estacoes = dados_in.pode_acessar_estacoes
    if dados_in.pode_gerenciar_alarmes is not None:
        usuario.pode_gerenciar_alarmes = dados_in.pode_gerenciar_alarmes
    if dados_in.pode_gerenciar_propriedades is not None:
        usuario.pode_gerenciar_propriedades = True if usuario.eh_administrador else dados_in.pode_gerenciar_propriedades
    elif usuario.eh_administrador:
        usuario.pode_gerenciar_propriedades = True

    if dados_in.propriedades_ids is not None:
        # Remove vínculos antigos
        db.query(UsuarioPropriedade).filter(UsuarioPropriedade.usuario_id == usuario.id).delete()
        # Insere novos vínculos válidos
        props_validas = db.query(Propriedade.id).filter(
            Propriedade.id.in_(dados_in.propriedades_ids),
            Propriedade.usuario_id == admin_id
        ).all()
        for p_id in [p[0] for p in props_validas]:
            db.add(UsuarioPropriedade(usuario_id=usuario.id, propriedade_id=p_id))

    db.commit()
    db.refresh(usuario)
    return _usuario_para_resposta(usuario, db)

@router.delete("/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover_colaborador(
    usuario_id: int,
    db: Session = Depends(deps.get_db),
    usuario_atual: Usuario = Depends(deps.get_current_user)
):
    """
    Exclui um colaborador e revoga todos os seus acessos.
    """
    if not usuario_atual.eh_administrador:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem remover usuários."
        )

    if usuario_id == usuario_atual.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Você não pode excluir sua própria conta de administrador."
        )

    admin_id = usuario_atual.id if usuario_atual.administrador_id is None else usuario_atual.administrador_id

    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado.")

    if usuario.administrador_id != admin_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Você não tem permissão para remover este usuário."
        )

    # Administrador delegado não pode remover outros administradores
    if usuario.eh_administrador and usuario_atual.administrador_id is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas o proprietário da conta pode remover outros administradores."
        )

    db.delete(usuario)
    db.commit()
    return None

