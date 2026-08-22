# Gate H5 — Voz nativa Udemy

**Branch:** `experiment/sia-caption-input-h0-h4`
**PR:** [#20 — Hook público SiaCaptionInput — H0–H4 aprovados](https://github.com/Christian-Yugen/S.IA_Audio-learning/pull/20)
**Status:** implementação H5 concluída; aguardando revisão e teste físico antes do merge
**Data:** 22 de agosto de 2026

## Escopo aprovado

O Gate H5 ativa a voz nativa do navegador para cues Udemy que atendam simultaneamente aos critérios `TextTrack`, confiança `high`, timing válido, player ativo, `safeToSpeak: true` e vídeo em reprodução. A cue é encaminhada ao mesmo `falar()` e à mesma fila nativa já utilizada pelo leitor Coursera.

> Piper Udemy, fila paralela, sincronização paralela e alteração de `sync-engine.js` continuam fora do escopo. Se Piper estiver selecionado globalmente, o contexto H5 usa explicitamente `nativeOnly: true`, impedindo que a cue Udemy seja desviada para o motor neural nesta etapa.

## Alterações realizadas

| Área | Alteração | Limite preservado |
|---|---|---|
| Fronteira H5 | `processarCueExterna()` aceita somente `source: texttrack` e `sourceConfidence: high` | Cues DOM não alcançam fala |
| Caminho de voz | Cue aceita chama `falar()` com `nativeOnly: true` | Reutiliza a fila e a lógica de sincronização comuns |
| Proteção de motor | `falar()` e `enfileirarFala()` não usam Piper quando `nativeOnly` está ativo | Piper Udemy permanece não autorizado |
| Diagnóstico | Eventos `SIA_H5_NATIVE_SPEECH` indicam `requested`, `started` ou `error` | Instrumentação não altera a fila |
| Fixture | Painel H5 separado para pedido, início e erro | Diagnóstico G7 original permanece intacto |
| Coursera | Nenhuma alteração em `sync-engine.js` ou no observador Coursera | Caminho funcional preservado |

## Testes automatizados

| Suíte | Resultado |
|---|---:|
| Plataforma, contrato H0–H2, integração H3–H4 e H5 | **22/22** |
| Adaptador Udemy experimental | **13/13** |
| Regressão Coursera | **20/20** |
| `git diff --check` | **limpo** |
| Hash protegido de `sync-engine.js` | **preservado** |

Os dois novos testes H5 demonstram que uma cue TextTrack usa a API nativa mesmo quando um provider Piper está globalmente ativo e que uma cue cuja fonte não é TextTrack não produz fala.

## Validação Chromium

A fixture HTTPS foi executada com Manifest V3 e os dois modos foram verificados.

| Cenário | Diagnóstico | Eventos H5 | Interpretação |
|---|---|---:|---|
| TextTrack temporal | `source: texttrack`, `confidence: high`, `PRIMARY_READY`, `safeToSpeak: true` | `requested: 2` | O caminho nativo comum foi acionado para as cues seguras |
| Legenda DOM | `source: dom-caption`, `confidence: low`, `UNSAFE_TO_SPEAK`, `safeToSpeak: false` | nenhum | A legenda DOM não alcançou a fala |

No modo headless, o navegador retornou `synthesis-failed` para a tentativa de iniciar áudio. Isso é uma limitação do ambiente de execução sem saída de áudio física, não uma aceitação de cue insegura: o painel confirma que os pedidos foram gerados somente para TextTrack segura, com `engine: browser`, enquanto o cenário DOM permaneceu sem evento H5.

Consequentemente, a validação Chromium confirma a seleção segura e o encaminhamento para a API nativa, mas **não deve ser interpretada como comprovação de som audível no ambiente headless**. O teste físico em uma sessão Chrome com áudio disponível ainda é necessário antes do merge.

## Proteções verificadas

| Verificação | Resultado |
|---|---|
| `extension/sync-engine.js` alterado | Não |
| SHA-256 de `sync-engine.js` | `8c2e9ad28c1c570e44d4c3c42148ada403dec696864b21675aedd2d6d9bef00a` |
| Fala direta no adaptador Udemy | Não |
| Piper chamado pelo adaptador Udemy | Não |
| Fonte DOM sem timing falada | Não |
| Fila duplicada para Udemy | Não |
| Fallback DOM Coursera alterado | Não |

## Critério para conclusão operacional do H5

A implementação H5 está pronta para revisão de código. A conclusão operacional exige que o revisor confirme a PR e que o teste físico em Chrome com áudio disponível produza voz nativa para uma cue TextTrack segura, não produza voz para a fixture DOM insegura e preserve pausa, retomada, seek e troca de player.

A PR não deve ser mesclada automaticamente. Piper Udemy só poderá ser discutido após a aprovação explícita deste Gate H5 e uma etapa posterior dedicada.

## Referências

[1]: https://github.com/Christian-Yugen/S.IA_Audio-learning/pull/20 "PR #20 — Hook público SiaCaptionInput"
[2]: /home/ubuntu/projects/s-ia-68a3ada2/UDEMY-AUDIO-HOOK-PROPOSAL.md "Proposta do hook público SiaCaptionInput"
[3]: /home/ubuntu/projects/s-ia-68a3ada2/UDEMY-AUDIO-HOOK-TEST-PLAN.md "Plano de testes H0–H5"
