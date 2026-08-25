# S·IA — Audio-learning by UXBRAS®

A **S·IA** é uma extensão para Google Chrome criada para transformar legendas de cursos online em uma experiência de aprendizagem por áudio. O projeto começou com o Coursera e segue uma expansão controlada para a Udemy e, experimentalmente, para o YouTube.

A extensão lê as legendas exibidas pelo player, organiza os fragmentos em sentenças, gera fala pela voz nativa do navegador ou pelo motor neural Piper PT-BR local, aplica sincronização adaptativa e oferece mecanismos de fallback quando a fonte principal de legendas não está disponível.

> **Princípio do projeto:** a S·IA deve crescer sem comprometer o que já funciona. Toda nova plataforma será adicionada por um adaptador isolado, enquanto o núcleo de áudio permanecerá único, compartilhado e protegido.

## Estado atual

O baseline funcional protegido é a **1.8.14**, com o caminho do Coursera e o motor neural local já validados. A branch experimental **1.8.17** acrescenta um seletor seguro de plataforma: Coursera e Udemy permanecem automáticos, enquanto o YouTube começa **desligado** e só é carregado após escolha explícita no popup. O motor nativo do navegador continua sendo a alternativa padrão; o Piper é opcional e deve ser ativado pelo usuário.

| Capacidade | Estado |
|---|---|
| Leitura de legendas no Coursera | Validada |
| Fallback de legenda pelo DOM | Implementado |
| Voz nativa do navegador | Padrão e preservada |
| Piper PT-BR local | Experimental e opcional |
| Pré-síntese da próxima legenda | Implementada |
| Fallback automático para voz nativa | Implementado |
| Diagnóstico de fonte e estado | Em evolução e obrigatório para novas plataformas |
| Adaptador Udemy | Automático, preservado e validado na fixture local |
| Seletor seguro de plataforma | Implementado; escolha por aba ou domínio |
| Adaptador YouTube | Experimental, manual e desligado por padrão |
| Recursos educacionais avançados | Roadmap posterior à expansão multiplataforma |

## Garantias de preservação

As regras abaixo são obrigatórias para qualquer alteração futura:

1. **Nenhuma alteração no motor funcional atual do Coursera.** O adaptador existente deve ser preservado e o novo suporte deve ser aditivo.
2. **Nenhuma cópia independente da lógica de áudio.** Coursera e Udemy devem utilizar o mesmo núcleo de voz, fila, sincronização, Piper e fallback.
3. **Diagnóstico e fallback desde o primeiro protótipo.** O usuário precisa saber se a S·IA está usando a fonte principal de legendas ou uma estratégia alternativa.

Essas regras estão formalizadas no [Documento Mestre de Expansão Multiplataforma](docs/governance/MASTER-SIA-EXPANSION.md). Nenhuma alteração dessas regras é permitida sem hipóteses investigadas, evidências reproduzíveis, comparação mensurável, regressão completa e aprovação prévia, explícita e específica do usuário.

## Arquitetura do repositório

```text
S.IA_Audio-learning/
├── extension/                    # Código carregável em chrome://extensions
│   ├── manifest.json             # Manifest V3
│   ├── content.js                # Orquestração na página do curso
│   ├── sync-engine.js             # Núcleo protegido de sincronização
│   ├── dom-fallback.js            # Fallback de leitura de legenda
│   ├── neural-tts/                # Piper + runtime WebAssembly local
│   ├── offscreen.html/js          # Host autorizado para o Worker neural
│   ├── service-worker.js          # Roteamento, gate e injeção segura
│   ├── platform-selection*.js     # Seletor e bootstrap opt-in YouTube
│   ├── platform-adapters/youtube/ # Adaptador YouTube isolado
│   ├── popup.*                    # Configuração do usuário
│   ├── sidepanel.*                # S·IA Companion
│   ├── tests/                     # Testes automatizados
│   └── scripts/                   # Empacotamento da extensão
├── docs/
│   ├── architecture/              # Contratos e decisões técnicas
│   ├── governance/                # Regras mestres e controle de mudanças
│   ├── roadmap/                   # Expansão e melhorias planejadas
│   ├── research/                  # Pesquisa de voz e alternativas técnicas
│   ├── reports/                   # Diagnósticos e validações
│   ├── releases/                  # Notas e checklists de releases
│   ├── legal/                     # Licenças, privacidade e pendências legais
│   ├── operations/                # Operação local e manutenção
│   └── decisions/                 # Registro de decisões arquiteturais
├── tools/                         # Utilitários auxiliares não executados pela extensão
└── .github/                       # Templates de issues e pull requests
```

## Execução local

A extensão não utiliza um processo de servidor para inferência neural. Para testar o código da extensão, instale o Node.js e execute:

```bash
cd extension
find tests platform-adapters/test -type f -name '*.test.js' -print0 | sort -z | xargs -0 node --test
```

Para carregá-la no Chrome, abra `chrome://extensions`, ative o **Modo do desenvolvedor**, escolha **Carregar sem compactação** e selecione a pasta `extension/`. Depois, abra uma nova aba da plataforma compatível para garantir que o content script seja carregado de novo.

O uso do Piper neural é experimental. A ativação deve ser feita pelo popup da extensão, depois que o modelo e o runtime estiverem presentes no pacote. Quando o Piper falhar, a extensão deverá retornar à voz nativa do navegador. No YouTube, a seleção também precisa ser aplicada explicitamente; nenhuma legenda ou áudio é processado pela S·IA nessa plataforma enquanto o modo estiver desligado.

## Estratégia de expansão

A expansão segue a sequência abaixo. Na release experimental 1.8.17, as etapas de contrato, diagnóstico, integração com o núcleo único e regressão foram aplicadas ao YouTube apenas por meio do gate manual; isso não declara suporte geral ou estabilidade equivalente ao Coursera.

| Fase | Resultado esperado |
|---|---|
| **1. Contrato de plataforma** | Definir eventos e responsabilidades comuns sem alterar o núcleo protegido. |
| **2. Observação passiva da Udemy** | Compreender player, legendas, recargas, troca de aula e situações de fallback. |
| **3. Adaptador Udemy mínimo** | Detectar player e cue sem iniciar recursos de áudio próprios. |
| **4. Diagnóstico e fallback** | Mostrar a fonte utilizada e degradar com segurança quando necessário. |
| **5. Integração com o núcleo único** | Encaminhar cues ao mesmo motor usado pelo Coursera. |
| **6. Regressão e validação física** | Repetir os testes do Coursera e validar aulas reais da Udemy. |
| **7. Compatibilidade experimental** | Liberar apenas com limitações documentadas e rollback pronto. |
| **8. Seletor seguro YouTube** | Ativar somente por domínio/aba, aceitar apenas páginas `/watch?v=...` e permitir desligamento reversível. |
| **9. Recursos de aprendizagem** | Adicionar notas, flashcards, tutor e revisão após a base multiplataforma estar estável. |

Nenhuma plataforma será considerada compatível apenas porque uma aula isolada funcionou. A plataforma deverá possuir adaptador identificado, diagnóstico, fallback, testes automatizados, validação real e regressão do Coursera.

## Estratégia de melhorias educacionais

Depois que a base multiplataforma estiver estável, a S·IA poderá evoluir para uma camada de aprendizagem ativa, sem misturar essa lógica com o núcleo de áudio. O roadmap prioriza notas sincronizadas, marcadores, flashcards, modo prova, revisão espaçada, glossário contextual, explicações em níveis e um Tutor Socrático.

O objetivo é transformar o ciclo passivo de assistir e ouvir em:

> **Ouvir → compreender → lembrar → responder → revisar.**

A camada educacional deverá consumir eventos padronizados da extensão, trabalhar localmente por padrão e continuar desligável sem alterar a leitura e a sincronização.

## Privacidade, licenças e distribuição

A extensão foi estruturada para processar localmente as legendas e as preferências do usuário. O bridge YouTube recupera captions temporais do endpoint same-origin do próprio vídeo e não envia legendas para um servidor de inferência. Entretanto, a distribuição pública do runtime, do modelo neural e de componentes de terceiros exige auditoria documental própria. O dataset declarado no model card não deve ser confundido automaticamente com uma licença de redistribuição comercial dos pesos finais.

O estado das licenças e pendências está registrado em [Licenças e distribuição](docs/legal/THIRD-PARTY-DISTRIBUTION.md). Até a conclusão dessa auditoria, o suporte neural deve ser tratado como **experimental/técnico**, não como uma promessa de uso comercial irrestrito.

## Documentação essencial

| Documento | Finalidade |
|---|---|
| [Documento Mestre](docs/governance/MASTER-SIA-EXPANSION.md) | Norma obrigatória de preservação e expansão. |
| [Arquitetura do sistema](docs/architecture/SYSTEM-ARCHITECTURE.md) | Separação entre adaptadores, núcleo de áudio e camada educacional. |
| [Estratégia de expansão](docs/roadmap/MULTIPLATFORM-EXPANSION-STRATEGY.md) | Roadmap Coursera → Udemy → YouTube experimental → futuras plataformas. |
| [Roadmap de melhorias](docs/roadmap/LEARNING-IMPROVEMENTS-ROADMAP.md) | Evolução para aprendizagem ativa. |
| [Plano oficial de execução](docs/roadmap/PLAN-EXECUTION-UDEMY-AND-LEARNING.md) | Fases, gates e aprovação da próxima etapa. |
| [Política de mudanças](docs/governance/CHANGE-CONTROL.md) | Processo normal, exceções e aprovação. |
| [Status da versão 1.8.17](docs/releases/1.8.17.md) | Escopo, seletor, testes, limitações e rollback da release experimental. |
| [Relatório do seletor seguro](docs/reports/PLATFORM-SELECTION-1.8.17.md) | Evidências automatizadas e físicas da política opt-in. |
| [Licenças de terceiros](docs/legal/THIRD-PARTY-DISTRIBUTION.md) | Situação do runtime, modelo e distribuição. |
| [Guia de contribuição](CONTRIBUTING.md) | Como propor e validar alterações. |

## Princípio de publicação

Este diretório foi preparado para ser a base de um repositório GitHub. Nenhum `push`, publicação de release ou abertura de repositório remoto está sendo presumido sem a definição do repositório de destino e a autorização do responsável pelo projeto.

Antes da publicação pública, devem ser revisados os dados pessoais, endereços de suporte, screenshots, termos de uso das plataformas, licença do produto e autorização de redistribuição dos pesos neurais.

## Licença do projeto

A licença do código da S·IA ainda deve ser definida pelo responsável pela UXBRAS®. Não é correto inserir uma licença permissiva ou proprietária sem essa decisão. Enquanto isso, o código permanece com **licença não especificada**, e os avisos de terceiros devem ser respeitados conforme documentado.
