## Resumo

Descreva o que foi alterado e por quê.

## Tipo de mudança

- [ ] Correção
- [ ] Novo adaptador
- [ ] Recurso de aprendizagem
- [ ] Diagnóstico
- [ ] Documentação
- [ ] Release
- [ ] Alteração excepcional aprovada

## Componentes afetados

Liste arquivos e módulos.

## Preservação do Coursera

- [ ] O caminho funcional do Coursera foi preservado.
- [ ] O `sync-engine.js` não foi alterado sem aprovação formal.
- [ ] A voz nativa continua disponível e padrão.
- [ ] O fallback de áudio continua funcionando.

## Núcleo único de áudio

- [ ] Não criei fila de áudio específica por plataforma.
- [ ] Não criei sincronizador específico por plataforma.
- [ ] Não criei bridge Piper específico por plataforma.
- [ ] A nova integração utiliza o núcleo compartilhado.

## Nova plataforma, se aplicável

- [ ] O adaptador é isolado e versionado.
- [ ] A fonte principal de legenda foi identificada.
- [ ] O fallback existe desde o primeiro protótipo.
- [ ] O diagnóstico informa a origem da legenda.
- [ ] Player ausente, legenda ausente, pausa, seek e troca de aula foram considerados.

## Testes

- [ ] `node --test tests/sync-engine.test.js tests/piper-bridge.test.js`
- [ ] Testes específicos da mudança.
- [ ] Validação de sintaxe.
- [ ] Teste físico no navegador, quando aplicável.
- [ ] Regressão do Coursera.

## Privacidade e licenças

- [ ] Não incluí segredos ou dados pessoais.
- [ ] Não incluí vídeos, perfis ou fixtures não autorizadas.
- [ ] Revisei licenças das novas dependências e modelos.
- [ ] Atualizei a documentação legal, quando necessário.

## Rollback

Descreva como desativar ou reverter a mudança.

## Exceção

Se houver alteração de regra protegida, indique o ID da aprovação prévia e o escopo exato autorizado. Sem aprovação explícita, a alteração não pode ser mesclada.
