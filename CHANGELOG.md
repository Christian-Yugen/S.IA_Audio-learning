# Changelog da S·IA

Todas as mudanças relevantes do projeto serão registradas neste arquivo. O histórico técnico detalhado permanece em `docs/history/`.

## [Não lançado]

### Planejado

- contrato comum de adaptadores de plataforma;
- investigação passiva do player e das legendas da Udemy;
- adaptador Udemy isolado, inicialmente experimental;
- diagnóstico da fonte principal e do fallback;
- regressão completa do Coursera para cada integração;
- notas sincronizadas, flashcards, modo prova e revisão espaçada após a estabilização multiplataforma;
- avaliação futura de Tutor Socrático, glossário contextual e shadowing.

Nenhum item planejado deverá ser interpretado como suporte já disponível.

## [1.8.5] — Neural sync fix

- aquecimento antecipado do Worker e runtime Piper local;
- pré-síntese da próxima cue durante a reprodução atual;
- deduplicação de sínteses em andamento;
- reutilização de resultados em cache;
- diagnóstico de frase atual e próxima frase;
- fallback automático para a voz nativa;
- host offscreen para execução autorizada do Worker;
- transporte de PCM entre contextos;
- 20 testes automatizados aprovados;
- validação em Chromium real.

## [1.8.4]

- correção arquitetural do Worker neural no host offscreen;
- correção de CSP para WebAssembly;
- correção do transporte PCM;
- tratamento de contexto invalidado;
- validação física do motor Piper experimental.

## [1.8.3]

- correções de CSP e inicialização do motor neural;
- preservação do motor nativo;
- melhorias de diagnóstico e ativação experimental.

## [1.8.2]

- correções de contexto e exceções do caminho neural;
- reforço do fallback para voz nativa.

## [1.7.0]

- baseline funcional do Coursera;
- leitura e sincronização das legendas;
- fallback de resolução pelo DOM;
- histórico, Recall e S·IA Companion;
- configurações locais e processamento local.

[Não lançado]: ../../compare/v1.8.5...HEAD
[1.8.5]: ../../releases/tag/v1.8.5
[1.8.4]: ../../releases/tag/v1.8.4
[1.8.3]: ../../releases/tag/v1.8.3
[1.8.2]: ../../releases/tag/v1.8.2
[1.7.0]: ../../releases/tag/v1.7.0
