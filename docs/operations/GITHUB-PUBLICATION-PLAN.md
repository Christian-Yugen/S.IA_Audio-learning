# Plano de publicação no GitHub

## Objetivo

Este plano descreve como transformar a pasta organizada em um repositório GitHub controlado, sem publicar automaticamente dados de teste, dependências não auditadas ou decisões ainda não aprovadas.

A pasta `github-ready/` foi preparada como staging local. Nenhuma operação remota é presumida por este documento.

## Estado atual do staging

| Item | Estado |
|---|---|
| Código da extensão | Copiado em `extension/` |
| Testes | Em `extension/tests/` |
| Documento Mestre | Em `docs/governance/` |
| Estratégia multiplataforma | Em `docs/roadmap/` |
| Roadmap educacional | Em `docs/roadmap/` |
| Histórico técnico | Em `docs/history/` |
| Licenças de terceiros | Em `docs/legal/` |
| Pacotes ZIP | Fora do staging e ignorados |
| Fixtures de vídeo | Fora do staging e ignoradas |
| Árvore de compilação | Fora do staging e ignorada |
| Segredos/perfis | Fora do staging e ignorados |
| Push remoto | Não executado |

## Pré-publicação obrigatória

Antes de criar ou tornar público o repositório, o responsável deverá:

1. definir o nome e a visibilidade do repositório;
2. definir a licença do código da S·IA;
3. confirmar o e-mail oficial de suporte;
4. publicar a política de privacidade em endereço HTTPS;
5. revisar o nome, a marca e os materiais visuais;
6. auditar a licença do runtime neural;
7. confirmar a redistribuição dos pesos Piper e dos componentes de fonemização;
8. decidir se os arquivos neurais serão publicados no repositório ou distribuídos por outro canal autorizado;
9. revisar todo o histórico para eliminar dados pessoais e conteúdo protegido;
10. confirmar os termos de uso das plataformas suportadas.

A ausência de qualquer item legal ou de privacidade não impede necessariamente um repositório privado de desenvolvimento, mas impede uma promessa pública de distribuição comercial sem ressalvas.

## Inicialização local

Na pasta staging:

```bash
git init -b main
git add .
git status --short
git diff --cached --stat
```

Antes do primeiro commit, deve-se verificar a lista de arquivos staged. O comando não deve mostrar perfis, vídeos, áudios privados, ZIPs, caches, tokens, arquivos `.env` ou a árvore `artifacts/`.

## Primeiro commit

O primeiro commit deverá representar somente a organização inicial e a documentação aprovada:

```bash
git commit -m "chore(repo): organiza base da SIA para expansão multiplataforma"
```

Mudanças de código, novo adaptador e alteração de regra não devem ser misturadas nesse commit inicial.

## Conexão com o repositório remoto

A URL remota deverá ser adicionada somente depois de o responsável confirmar o destino:

```bash
git remote add origin <URL_DO_REPOSITORIO>
git push -u origin main
```

A operação de push é uma publicação externa e deverá ser realizada conscientemente pelo responsável do projeto após a revisão final.

## Branches sugeridas

| Branch | Uso |
|---|---|
| `main` | Código e documentação aprovados. |
| `develop` | Integração antes da liberação, se o projeto precisar desse nível. |
| `feature/udemy-adapter` | Desenvolvimento isolado do adaptador Udemy. |
| `feature/learning-layer` | Recursos de aprendizagem ativa. |
| `fix/<descricao>` | Correções delimitadas e testáveis. |
| `docs/<descricao>` | Documentação sem mudança executável. |

O nome da branch não autoriza alteração de componente protegido. As regras do Documento Mestre continuam válidas em todas as branches.

## Releases no GitHub

A release deverá apontar para uma tag e conter notas com escopo, testes, limitações, licença e rollback. O ZIP de distribuição só poderá ser anexado depois de passar pela revisão de manifesto, estrutura, CSP, permissões, recursos e licenças.

Releases antigas podem ser mantidas como artefatos de download, mas não devem ser copiadas para dentro da árvore de código.

## Política de issues

Issues deverão ser usadas para propostas de recurso, compatibilidade, falhas, documentação e auditoria. Um relatório de bug deverá separar falha da plataforma, falha do adaptador, falha do núcleo de áudio e falha de embalagem.

Uma issue que proponha alterar regra protegida deverá ser marcada como `exception-required` e não poderá ser implementada sem aprovação formal.

## Política de pull requests

Um pull request deverá informar arquivos afetados, impacto no Coursera, uso do núcleo compartilhado, diagnóstico, fallback, testes, privacidade, licença e rollback. A ausência de uma dessas informações deverá bloquear a revisão final.

## Checklist final de publicação

- [ ] O staging não contém dados sensíveis.
- [ ] O staging não contém fixtures não autorizadas.
- [ ] O staging não contém builds de compilação desnecessários.
- [ ] O README aponta para o Documento Mestre.
- [ ] A documentação da Udemy está marcada como planejada/experimental.
- [ ] O código da extensão está em `extension/`.
- [ ] O carregamento local foi testado apontando para `extension/`.
- [ ] Os testes automatizados foram executados.
- [ ] O código do produto possui licença decidida.
- [ ] O runtime e os pesos neurais foram auditados.
- [ ] O endereço de suporte e a política de privacidade foram definidos.
- [ ] O responsável aprovou o primeiro push.
