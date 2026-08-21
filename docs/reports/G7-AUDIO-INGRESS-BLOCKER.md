# Gate G7 — Relatório do ponto de entrada de áudio

**Branch:** `experiment/udemy-core-integration-g7`
**Status:** diagnóstico integrado aprovado; áudio Udemy bloqueado até criação de um hook público e aditivo
**Data:** 21 de agosto de 2026

## 1. Resultado principal

A integração aditiva já consegue carregar o roteador, o adaptador Udemy, a ponte de eventos e o estado diagnóstico comum. Em uma fixture HTTPS executada em Chromium, o player criado tardiamente foi localizado como `video#lecture-4242`, a identidade Shaka foi preservada, a legenda DOM foi identificada como fonte de baixa confiança e o estado final foi `UNSAFE_TO_SPEAK` com `safeToSpeak: false`.

O áudio, entretanto, ainda não deve ser ativado. A inspeção do content script Coursera protegido demonstrou que ele mantém a fila, a sincronização, o Piper, o fallback e a leitura de legenda em escopo privado da IIFE. Ele não expõe uma função pública ou evento de entrada que permita ao adaptador Udemy entregar uma cue segura ao mesmo núcleo sem alterar o arquivo protegido.

## 2. Evidências da inspeção

| Evidência | Resultado |
|---|---|
| Funções de fala no content script Coursera | Privadas dentro da IIFE |
| Entrada pública para cue externa | Não encontrada |
| Entrada pública de configuração | `SIA_CONFIG_UPDATE`, mas não aceita cue |
| Entrada pública de teste Piper | `SIA_TEST_NEURAL_VOICE`, não é caminho de legenda |
| Status público | `SIA_GET_STATUS`, somente leitura |
| `sync-engine.js` | Hash protegido preservado |
| Alternativa segura já testada | Ponte `SIA_CORE_EVENT` + diagnóstico comum |

## 3. Por que não carregar o content script Coursera na Udemy agora

Carregar diretamente `sync-engine.js`, `dom-fallback.js`, `piper-bridge.js` e `content.js` no bloco Udemy pareceria reutilizar o núcleo, mas não é seguro na forma atual. O content script existente observa DOM quando não encontra `TextTrack` e pode chamar sua rotina privada `falar` depois da estabilização. Na Udemy, a fonte observada é justamente uma legenda visual sem tempo confiável. Sem uma barreira de confiança no leitor protegido, essa combinação poderia transformar uma legenda DOM em fala, contrariando o contrato `UNSAFE_TO_SPEAK`.

Também não é aceitável contornar a ausência de entrada copiando a fila, chamando Piper diretamente, duplicando o sincronizador ou criando um segundo content script de áudio. Essas alternativas violariam o Documento Mestre.

## 4. O que está implementado e validado

A branch G7 contém, de forma aditiva:

| Componente | Estado |
|---|---|
| Roteador de adaptadores | Implementado |
| Host Udemy | Implementado |
| Adaptador Udemy | Reutilizado sem APIs de áudio |
| Ponte `SIA_PLATFORM_EVENT` → `SIA_CORE_EVENT` | Implementada |
| Estado diagnóstico comum | Implementado |
| Bloqueio de cue sem timing | Implementado e testado |
| Manifesto para aula Udemy | Adicionado de forma isolada |
| Fila/Piper/sincronização Udemy | Não criado, conforme regra |
| Entrada de áudio no núcleo protegido | Ainda ausente |

## 5. Validações

| Suíte ou cenário | Resultado |
|---|---:|
| Testes de roteamento e ponte | 6/6 |
| Testes adapter → diagnóstico comum | 3/3 |
| Testes experimentais Udemy | 13/13 |
| Testes oficiais Coursera | 20/20 |
| Fixture HTTPS em Chromium | Aprovada |
| Player criado tardiamente | Reconectado |
| Diagnóstico observado | `player: found`, `source: dom-caption`, `confidence: low` |
| Estado de segurança | `UNSAFE_TO_SPEAK`, `safeToSpeak: false` |
| Hash `sync-engine.js` | Preservado |

## 6. Decisão necessária antes do áudio

Para usar o mesmo núcleo de áudio, será necessário um **hook público, aditivo e testável** no limite entre o adaptador e o leitor existente. A alternativa recomendada é criar uma pequena interface de entrada no host comum, por exemplo:

```javascript
SiaCaptionInput.push({
  platformId,
  adapterVersion,
  text,
  startTime,
  endTime,
  source,
  sourceConfidence,
  playerIdentity,
  safeToSpeak
});
```

Esse hook deverá ser consumido pelo núcleo existente sem duplicar fila, Piper ou sincronização. Ele deverá rejeitar entradas com `safeToSpeak: false`, registrar a origem e preservar o caminho atual do Coursera. A criação desse hook exigirá revisão específica porque envolve o limite do content script protegido, embora não exija alteração do `sync-engine.js` se implementada em um ponto de extensão fora dele.

Enquanto o hook não existir e não estiver coberto por testes, a branch deverá permanecer em modo diagnóstico. Nenhum pacote deve anunciar leitura de áudio Udemy.

## 7. Escopo bloqueado

Permanece bloqueado até nova confirmação técnica e revisão:

1. Ativar voz nativa para cues Udemy.
2. Ativar Piper para cues Udemy.
3. Encaminhar `SIA_CAPTION_CHANGED` para uma rotina privada do Coursera.
4. Carregar o content script Coursera completo na Udemy sem barreira de confiança.
5. Alterar `sync-engine.js`.
6. Criar fila, sincronizador ou bridge neural específico da Udemy.

## 8. Conclusão

O Gate G7 foi executado corretamente até o limite que a arquitetura atual permite com segurança. A integração de plataforma e diagnóstico está pronta; a integração de áudio não deve ser falsificada nem contornada. O próximo passo correto é revisar e aprovar o desenho do hook público de entrada do núcleo, com escopo delimitado, teste de regressão Coursera e rollback explícito.

## Referências

[1]: https://github.com/Christian-Yugen/S.IA_Audio-learning/pull/18 "PR #18 — contrato experimental Udemy"
[2]: /tmp/sia-udemy-adapter-implementation/docs/decisions/G7-INTEGRATION-BASELINE.md "Baseline do Gate G7"
[3]: /home/ubuntu/projects/s-ia-68a3ada2/UDEMY-CORE-INTEGRATION-PROPOSAL.md "Proposta de integração aditiva"
[4]: /home/ubuntu/projects/s-ia-68a3ada2/UDEMY-CORE-INTEGRATION-TEST-PLAN.md "Plano de testes da integração"
