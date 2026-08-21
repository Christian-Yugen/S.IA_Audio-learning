# Documentação da S·IA

Este índice organiza as decisões e materiais do projeto. O Documento Mestre tem precedência sobre documentos históricos, rascunhos e planos.

## Governança

| Documento | Uso |
|---|---|
| [Documento Mestre](governance/MASTER-SIA-EXPANSION.md) | Regras invioláveis e protocolo de exceção. |
| [Controle de mudanças](governance/CHANGE-CONTROL.md) | Fluxo para issues, branches, commits, testes e aprovação. |
| [Decisão ADR-0001](decisions/0001-adapters-protected-core.md) | Adaptadores isolados e núcleo protegido. |

## Arquitetura

| Documento | Uso |
|---|---|
| [Arquitetura do sistema](architecture/SYSTEM-ARCHITECTURE.md) | Camadas, eventos, estados e limites de acoplamento. |
| [Especificação do adaptador Udemy](architecture/UDEMY-ADAPTER-DESIGN.md) | Fontes candidatas, cue, ciclo de vida, diagnóstico e fallback. |

## Roadmap

| Documento | Uso |
|---|---|
| [Expansão multiplataforma](roadmap/MULTIPLATFORM-EXPANSION-STRATEGY.md) | Coursera, Udemy e plataformas futuras. |
| [Melhorias de aprendizagem](roadmap/LEARNING-IMPROVEMENTS-ROADMAP.md) | Notas, flashcards, modo prova, tutor e revisão. |
| [Plano oficial de execução](roadmap/PLAN-EXECUTION-UDEMY-AND-LEARNING.md) | Fases, gates e aprovação para Udemy e aprendizagem ativa. |

## Releases e operação

| Documento | Uso |
|---|---|
| [S·IA 1.8.5](releases/1.8.5.md) | Escopo, testes, limitações e rollback. |
| [Baseline Coursera 1.8.5](reports/BASELINE-COURSERA-1.8.5.md) | Congelamento, hashes, regressão e comparação remota. |
| [Relatório da Fase 1 Udemy](reports/PHASE1-UDEMY-OBSERVATION.md) | Player real, legendas, transcrição, recarga e limitações. |
| [Log de observação Udemy](reports/PHASE1-UDemy-OBSERVATION-LOG.md) | Evidências brutas e hipóteses observadas. |
| [Plano de publicação no GitHub](operations/GITHUB-PUBLICATION-PLAN.md) | Staging, revisão e publicação remota. |
| [Histórico técnico](history/README.md) | Análises e diagnósticos anteriores. |

## Pesquisa e legal

| Documento | Uso |
|---|---|
| [Licenças de terceiros](legal/THIRD-PARTY-DISTRIBUTION.md) | Runtime, modelo, voz e distribuição. |
| [Status da licença do projeto](legal/PROJECT-LICENSE-STATUS.md) | Decisão pendente sobre a licença do código. |
| [Pesquisa inicial Udemy](research/UDEMY-OFFICIAL-RESEARCH.md) | Evidências oficiais e hipóteses verificáveis do player e das legendas. |
| [Pesquisa de voz feminina](research/VOICE-FEMALE-PTBR.md) | Situação de vozes PT-BR e futura gravação autorizada. |
| [Plano Piper](research/PIPER-IMPLEMENTATION-PLAN.md) | Histórico e base técnica do motor neural. |
| [Recomendação TTS PT-BR](research/PTBR-TTS-RECOMMENDATION.md) | Pesquisa de alternativas de síntese. |

## Hierarquia documental

Quando houver conflito, aplicar esta ordem:

1. aprovação explícita registrada para uma exceção específica;
2. Documento Mestre;
3. decisões arquiteturais aceitas;
4. documentação da release atual;
5. roadmap;
6. histórico técnico.

Um documento histórico explica o passado, mas não autoriza alterar as regras atuais.
