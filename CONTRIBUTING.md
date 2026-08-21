# Guia de contribuição — S·IA

## Antes de começar

Leia o [Documento Mestre de Expansão Multiplataforma](docs/governance/MASTER-SIA-EXPANSION.md) antes de modificar qualquer arquivo. Ele define as regras invioláveis do projeto.

A pergunta central de toda contribuição é:

> **Esta mudança adiciona capacidade sem alterar o caminho funcional já validado?**

Se a resposta não for claramente “sim”, a proposta deverá ser interrompida e analisada pelo protocolo de exceção.

## Organização do código

O código carregável da extensão fica em `extension/`. A pasta `extension/` é a raiz que deve ser escolhida em **Carregar sem compactação** no Chrome.

O núcleo protegido inclui o caminho do Coursera, o `sync-engine.js`, a voz nativa, o provedor Piper, a fila, a pré-síntese e o fallback de áudio. Novos sites devem ser integrados por adaptadores isolados e não por cópia do núcleo.

A documentação, os diagnósticos, a estratégia de expansão e as decisões ficam em `docs/`. Utilitários auxiliares que não são carregados pela extensão ficam em `tools/`.

## Como executar os testes

```bash
cd extension
node --test tests/sync-engine.test.js tests/piper-bridge.test.js
```

Toda alteração em áudio, sincronização, manifest, mensagens, storage, content script ou adaptador deverá repetir os testes completos. Quando houver acesso ao navegador real, deverá ser executada também a validação física e seu resultado deverá ser registrado em `docs/reports/`.

## Como adicionar uma plataforma

A integração deve seguir esta ordem:

1. registrar hipótese, escopo, riscos e critério de sucesso;
2. observar a plataforma passivamente;
3. criar adaptador mínimo;
4. incluir diagnóstico da fonte de legenda;
5. incluir fallback desde o primeiro protótipo;
6. emitir cues normalizadas;
7. conectar ao núcleo comum;
8. testar voz nativa;
9. testar Piper e fallback, quando aplicável;
10. repetir a regressão do Coursera;
11. publicar inicialmente como experimental;
12. promover somente após cumprir os critérios de aceitação.

Um adaptador não deve criar fila, sincronizador, provedor neural ou lógica de áudio própria.

## Alteração de componente protegido

Não altere `sync-engine.js`, o caminho protegido do Coursera ou o núcleo compartilhado apenas para facilitar uma nova integração. Se a alteração parecer indispensável, abra uma proposta formal conforme o [Controle de Mudanças](docs/governance/CHANGE-CONTROL.md) e aguarde aprovação explícita.

A aprovação deverá ser anterior à edição e indicar exatamente a regra, o arquivo, a alteração e a versão autorizada.

## Checklist do pull request

- [ ] Li o Documento Mestre.
- [ ] Identifiquei os componentes protegidos afetados ou potencialmente afetados.
- [ ] Mantive um único núcleo de áudio.
- [ ] Não dupliquei fila, sincronização, Piper ou fallback.
- [ ] Adicionei diagnóstico para a fonte da legenda.
- [ ] Adicionei fallback desde o protótipo, quando se trata de nova plataforma.
- [ ] Executei os testes automatizados.
- [ ] Executei regressão do Coursera, quando aplicável.
- [ ] Registrei limitações e resultado da validação.
- [ ] Revisei licenças e dados sensíveis.
- [ ] Defini rollback.
- [ ] Obtive aprovação extraordinária, quando aplicável.

## Estilo de commits

Prefira commits pequenos e auditáveis, por exemplo:

```text
feat(adapter): adiciona contrato inicial de plataforma
feat(udemy): detecta cue principal em modo experimental
fix(diagnostics): informa fonte fallback da legenda
test(adapter): cobre troca e recriação do player
docs(roadmap): atualiza sequência de expansão
```

Não misture uma alteração protegida com limpeza geral, atualização de dependências, mudança visual e nova plataforma no mesmo commit.

## Relato de problemas

Um relato útil deve informar plataforma, navegador, versão da S·IA, estado do motor, fonte indicada pelo diagnóstico, URL sem dados privados quando possível, passos para reproduzir, resultado esperado, resultado observado e se o problema ocorre com voz nativa, Piper ou ambos.

Não inclua tokens, cookies, dados de conta, capturas com informações pessoais ou conteúdo de curso que você não tenha autorização para compartilhar.
