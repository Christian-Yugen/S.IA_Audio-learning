# SiaCaptionInput — Resultado H0–H4

**Branch:** `experiment/sia-caption-input-h0-h4`  
**Status:** implementação concluída; aguardando revisão independente  
**Data:** 22 de agosto de 2026

## Resultado

O hook público `SiaCaptionInput` foi implementado e conectado ao leitor comum sem alterar `sync-engine.js`. O adaptador Udemy continua responsável por descoberta de player, fonte e confiança; o hook valida a cue e somente encaminha entradas temporais de alta confiança para a rotina de fala já existente.

O caminho Coursera autônomo foi preservado. No contexto Udemy, o observador genérico de legenda do `content.js` não é iniciado; apenas eventos aceitos pelo hook podem alcançar a rotina comum. Isso impede que a legenda DOM visual seja convertida em fala por acidente.

## Contrato aplicado

| Critério | Regra |
|---|---|
| Plataforma | Deve estar registrada; Udemy é registrada por padrão |
| Texto | Não vazio e normalizado |
| Fonte | Deve declarar a fonte da cue |
| Confiança | Exatamente `high` para áudio |
| Timing | `startTime >= 0` e `endTime > startTime` |
| Player | Identidade deve corresponder ao player ativo |
| Segurança | `safeToSpeak` deve ser exatamente `true` |
| Estado | Cue durante pausa é rejeitada |
| Duplicação | Mesma cue do mesmo player é rejeitada |
| Encerramento | Após `destroy`, toda entrada é rejeitada |

## Testes automatizados

| Suíte | Resultado |
|---|---:|
| Contrato, segurança, deduplicação e ciclo de vida H0–H2 | 8/8 |
| Ponte, roteador e diagnóstico comum | 9/9 |
| Integração H3/H4 com o leitor comum | 3/3 |
| Total da plataforma | 20/20 |
| Adaptador Udemy experimental | 13/13 |
| Regressão oficial Coursera | 20/20 |

O harness H3/H4 usa uma Web Speech API falsa apenas para verificar que a cue aceita alcança o mesmo caminho de fala do content script. Ele confirma também que cues `dom-caption`, confiança baixa, timing ausente e vídeo pausado não produzem fala.

## Validação Chromium

A fixture HTTPS local foi executada com Chromium headless e a branch do hook carregada por Manifest V3.

| Cenário | Resultado observado |
|---|---|
| Player criado depois do carregamento | `video#lecture-4242` encontrado |
| TextTrack temporal | `source: texttrack`, `confidence: high`, `state: PRIMARY_READY`, `safeToSpeak: true` |
| Legenda DOM sem timing | `source: dom-caption`, `confidence: low`, `state: UNSAFE_TO_SPEAK`, `safeToSpeak: false` |
| Vídeo sintético | WebM local sem faixa de áudio |
| APIs de áudio no adaptador | Nenhuma |

O cenário seguro usa `VTTCue` sintética apenas na fixture local para validar o contrato temporal. Isso não significa que a Udemy real já foi promovida a suporte de áudio; a ativação física na Udemy continua condicionada a uma fonte temporal comprovada e a um novo gate.

## Proteção do Coursera

| Verificação | Resultado |
|---|---|
| `sync-engine.js` | Não alterado |
| Hash SHA-256 | `8c2e9ad28c1c570e44d4c3c42148ada403dec696864b21675aedd2d6d9bef00a` |
| Suíte Coursera | 20/20 |
| Fila e sincronização | Permanecem no leitor comum |
| Piper | Não carregado no bloco Udemy nesta etapa |
| Fallback DOM genérico Coursera | Não iniciado no contexto Udemy |

## Próximo gate

H0–H4 demonstram que a fronteira de entrada funciona e é fail-closed. Antes de uma demonstração de voz na Udemy, é necessária uma etapa independente para comprovar uma fonte temporal real em aula Udemy e testar primeiro a voz nativa. Piper permanece desligado para Udemy até outro gate.

## Referências

[1]: /home/ubuntu/projects/s-ia-68a3ada2/UDEMY-AUDIO-HOOK-PROPOSAL.md "Proposta do hook público"
[2]: /home/ubuntu/projects/s-ia-68a3ada2/UDEMY-AUDIO-HOOK-TEST-PLAN.md "Plano de testes H0–H5"
[3]: https://github.com/Christian-Yugen/S.IA_Audio-learning/pull/19 "PR #19 — integração diagnóstica Udemy"
