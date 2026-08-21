# Baseline do Gate G7 — Integração aditiva Udemy

**Status:** congelado antes da implementação
**Branch:** `experiment/udemy-core-integration-g7`
**Data:** 21 de agosto de 2026

## Identidade do baseline

| Item | Valor |
|---|---|
| HEAD da branch de integração | `b00632a09c5d130cb001fc7bf904e70eb7af5aa4` |
| `origin/main` | `1bee892f4d58ff7a277e6825308be068252a0f4b` |
| PR de origem | [#18 — contrato experimental Udemy][1] |
| Branch de origem | `experiment/udemy-adapter-contract` |
| Hash SHA-256 de `extension/sync-engine.js` | `8c2e9ad28c1c570e44d4c3c42148ada403dec696864b21675aedd2d6d9bef00a` |

## Testes antes da integração

| Suíte | Resultado |
|---|---:|
| Testes oficiais Coursera | 20/20 aprovados |
| Testes do adaptador Udemy | 13/13 aprovados |
| Working tree na criação da branch | Limpo |

## Limites congelados

O `sync-engine.js` não será alterado. O fluxo funcional do Coursera, a fila de fala, o provedor Piper, o host offscreen, a pré-síntese, a sincronização e o fallback de áudio permanecem protegidos.

A implementação do Gate G7 será aditiva e poderá acrescentar roteamento, registro de adaptador, diagnóstico e testes. O adaptador Udemy não poderá criar fila própria, chamar Piper diretamente, chamar `speechSynthesis`, ajustar velocidade do vídeo, implementar sincronização própria ou converter legenda DOM sem timing em fala.

A branch será mantida separada da `main` e da PR #18 até revisão e aprovação posterior do merge.

## Critério de comparação pós-implementação

Depois de cada etapa, o hash protegido e as suítes Coursera/Udemy serão repetidos. Qualquer divergência não explicada interromperá a implementação até análise e rollback.

## Referência

[1]: https://github.com/Christian-Yugen/S.IA_Audio-learning/pull/18 "PR #18 — contrato experimental Udemy"
