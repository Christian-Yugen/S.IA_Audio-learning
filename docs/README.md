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
| [S·IA 1.8.5](releases/1.8.5.md) | Escopo, testes, limitações e rollback do baseline neural. |
| [S·IA 1.8.17](releases/1.8.17.md) | Seletor seguro, YouTube opt-in, testes, limitações e rollback. |
| [S·IA 1.8.18](releases/1.8.18.md) | Atualização limpa, flush temporal YouTube e diagnóstico de contexto invalidado. |
| [S·IA 1.8.19](releases/1.8.19.md) | Compatibilidade TrustedHTML, fallback XML temporal e validação YouTube/Piper. |
| [S·IA 1.8.20](releases/1.8.20.md) | Remove DOMParser do caminho YouTube e elimina a violação TrustedHTML. |
| [S·IA 1.8.21](releases/1.8.21.md) | Recupera o áudio Piper após gesto real e explicita o diagnóstico YouTube. |
| [S·IA 1.8.22](releases/1.8.22.md) | Obtém captions temporais pelo player IOS local e emite cues completas imediatamente. |
| [S·IA 1.8.23](releases/1.8.23.md) | Agrupa captions palavra-a-palavra em frases contínuas sem reiniciar o Piper. |
| [S·IA 1.8.24](releases/1.8.24.md) | Preserva a legenda visual do YouTube e mantém a agregação de frases. |
| [S·IA 1.8.25](releases/1.8.25.md) | Evita repetir frases quando o YouTube muda a qualidade do stream. |
| [S·IA 1.8.26](releases/1.8.26.md) | Seleciona uma cue por instante e não mantém bloqueio inseguro entre cues temporais. |
| [S·IA 1.8.27](releases/1.8.27.md) | Recarrega a aba quando YouTube já estava injetado, removendo sessões antigas. |
| [S·IA 1.8.28](releases/1.8.28.md) | Remove o reset do agregador que apagava captions nativas fragmentadas. |
| [S·IA 1.8.29](releases/1.8.29.md) | Amplia o buffer para não liberar frases fragmentadas após duas ou três palavras. |
| [S·IA 1.8.30](releases/1.8.30.md) | Usa lookahead temporal para sintetizar a sentença fragmentada como uma unidade contínua. |
| [S·IA 1.8.31](releases/1.8.31.md) | Mantém a sentença unificada quando a continuação começa na linha visual seguinte. |
| [S·IA 1.8.32](releases/1.8.32.md) | Usa sequência local para manter a continuidade mesmo sem ID nativo da cue. |
| [S·IA 1.8.33](releases/1.8.33.md) | Companion com marcação, cartões e revisão espaçada local. |
| [S·IA 1.8.34](releases/1.8.34.md) | Companion autoexplicativo com orientação por etapas e estados claros. |
| [S·IA 1.8.35](releases/1.8.35.md) | Explica a revisão como responder, mostrar a resposta e avaliar a própria lembrança. |
| [S·IA 1.8.36](releases/1.8.36.md) | Resumo local sob demanda e leitura opcional pelo núcleo Browser/Piper. |
| [S·IA 1.8.37](releases/1.8.37.md) | Permite ouvir o resumo mesmo com o vídeo já pausado. |
| [S·IA 1.8.38](releases/1.8.38.md) | Evita iniciar o AudioContext sem gesto e mantém o desbloqueio recuperável. |
| [S·IA 1.8.39](releases/1.8.39.md) | Reúne localmente as falas iniciadas pela S·IA para visualizar, salvar e ouvir. |
| [S·IA 1.8.40](releases/1.8.40.md) | Corrige a apresentação: é registro da legenda lida, não resumo nem análise. |
| [Baseline Coursera 1.8.5](reports/BASELINE-COURSERA-1.8.5.md) | Congelamento, hashes, regressão e comparação remota. |
| [Relatório da Fase 1 Udemy](reports/PHASE1-UDEMY-OBSERVATION.md) | Player real, legendas, transcrição, recarga e limitações. |
| [Log de observação Udemy](reports/PHASE1-UDemy-OBSERVATION-LOG.md) | Evidências brutas e hipóteses observadas. |
| [Relatório da Fase 2 Udemy](reports/PHASE2-UDEMY-RUNTIME-REPORT.md) | Runtime real, fontes de cue, diagnóstico e regressão. |
| [Relatório do seletor 1.8.17](reports/PLATFORM-SELECTION-1.8.17.md) | Evidências do gate YouTube, isolamento, off e não-regressão. |
| [Log de runtime Fase 2](reports/PHASE2-RUNTIME-OBSERVATION-LOG.md) | Métricas sanitizadas das capturas e do probe. |
| [Plano de publicação no GitHub](operations/GITHUB-PUBLICATION-PLAN.md) | Staging, revisão e publicação remota. |
| [Histórico técnico](history/README.md) | Análises e diagnósticos anteriores. |

## Pesquisa e legal

| Documento | Uso |
|---|---|
| [Licenças de terceiros](legal/THIRD-PARTY-DISTRIBUTION.md) | Runtime, modelo, voz e distribuição. |
| [Status da licença do projeto](legal/PROJECT-LICENSE-STATUS.md) | Decisão pendente sobre a licença do código. |
| [Pesquisa inicial Udemy](research/UDEMY-OFFICIAL-RESEARCH.md) | Evidências oficiais e hipóteses verificáveis do player e das legendas. |
| [Protocolo experimental Fase 2](experiments/PHASE2-RUNTIME-PROTOCOL.md) | Isolamento, privacidade, métricas e critérios do probe. |
| [Comparação de fontes Fase 2](experiments/PHASE2-SOURCE-COMPARISON.md) | `TextTrack`, DOM, transcrição, ciclo de vida e confiança. |
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
