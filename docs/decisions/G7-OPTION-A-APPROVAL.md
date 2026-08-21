# Decisão G7 — Aprovação da Opção A

**Projeto:** S·IA — Audio-learning by UXBRAS®  
**Data:** 21 de agosto de 2026  
**PR:** [#19 — Integração aditiva Udemy com diagnóstico S·IA][1]  
**Branch:** `experiment/udemy-core-integration-g7`  
**Status:** aprovada para revisão/merge conforme o escopo abaixo

## Aprovação registrada

> “Aprovo a Opção A.”

A aprovação autoriza a integração da Udemy como **suporte diagnóstico experimental**, sem habilitar áudio Udemy nesta etapa.

## Escopo autorizado

| Item | Autorizado |
|---|---:|
| Roteador de adaptadores | Sim |
| Host e ciclo de vida Udemy | Sim |
| Diagnóstico de player, fonte e confiança | Sim |
| Ponte de eventos normalizados | Sim |
| Bloqueio `UNSAFE_TO_SPEAK` | Sim |
| Manifesto para o contexto de aula Udemy | Sim |
| Fixture e testes de integração | Sim |
| Merge da PR #19 após revisão | Pode ser avaliado conforme os checks |

## Escopo não autorizado

| Item | Estado |
|---|---|
| Voz nativa Udemy | Não autorizado nesta decisão |
| Piper Udemy | Não autorizado nesta decisão |
| Hook público de áudio | Etapa futura separada |
| Alteração do `sync-engine.js` | Proibida |
| Fila ou sincronizador Udemy | Proibido |
| Bridge neural Udemy | Proibido |
| Fala de legenda DOM sem timing | Proibida |
| Alteração do caminho funcional Coursera | Proibida |

## Evidências da entrega

| Verificação | Resultado |
|---|---:|
| Testes da integração | 9/9 |
| Testes do adaptador Udemy | 13/13 |
| Testes Coursera | 20/20 |
| Fixture Chromium | Aprovada |
| Hash `sync-engine.js` | `8c2e9ad28c1c570e44d4c3c42148ada403dec696864b21675aedd2d6d9bef00a` |
| PR #19 | Aberta, sem merge automático |

## Regra para a próxima etapa

Qualquer tentativa de ativar voz Udemy deverá iniciar uma nova proposta de mudança, com um hook público e testável no limite do núcleo, regressão Coursera e nova aprovação específica. Esta decisão não autoriza essa etapa futura.

## Referência

[1]: https://github.com/Christian-Yugen/S.IA_Audio-learning/pull/19 "PR #19 — Integração aditiva Udemy com diagnóstico S·IA"
