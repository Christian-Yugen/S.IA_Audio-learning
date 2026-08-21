# Plano oficial de execução
## Adaptador Udemy e evolução educacional da S·IA

**Projeto:** S·IA — Audio-learning by UXBRAS®  
**Versão do plano:** 1.0 — proposta para aprovação  
**Data:** 21 de agosto de 2026  
**Status:** Planejamento; nenhuma implementação deste plano está autorizada automaticamente  
**Baseline protegido:** S·IA 1.8.5 / Coursera  
**Próxima plataforma:** Udemy

---

## 1. Propósito

Este documento transforma a estratégia de expansão da S·IA em um plano executável, auditável e reversível. A primeira frente será a análise e o suporte experimental à Udemy. A segunda frente, posterior à compatibilidade, será a evolução da S·IA para uma camada de aprendizagem ativa com notas, flashcards, modo prova e revisão espaçada.

A ordem é deliberada: primeiro a S·IA deverá aprender a acompanhar corretamente diferentes players; depois poderá usar esse fluxo comum para ajudar o usuário a aprender melhor.

> **A expansão será feita por adaptação, não por reescrita.**

---

## 2. Regras de autoridade

Este plano está subordinado ao [Documento Mestre](../governance/MASTER-SIA-EXPANSION.md). As regras abaixo são condições de entrada e não podem ser relaxadas durante a execução normal:

| Regra | Aplicação no plano |
|---|---|
| **Preservar o Coursera** | O caminho funcional existente não será substituído. O `sync-engine.js` é tratado como protegido. |
| **Um único núcleo de áudio** | Udemy e Coursera utilizarão a mesma voz nativa, Piper, fila, sincronização, pré-síntese e fallback. |
| **Diagnóstico e fallback desde o protótipo** | Nenhuma prova de conceito será considerada concluída sem informar a fonte da legenda e o caminho alternativo. |
| **Mudança excepcional somente com aprovação** | Alterações em componentes protegidos exigem hipóteses testadas, evidências, regressão e aprovação prévia explícita. |
| **Privacidade local por padrão** | A observação e os testes não devem enviar legendas, histórico, cookies ou dados de conta para serviços externos. |

O plano não autoriza, por si só, a implementação de um novo adaptador, a alteração do manifesto ou a mudança do núcleo. Cada etapa terá um gate próprio.

---

## 3. Objetivo geral

Entregar um adaptador Udemy experimental que detecte corretamente o player e as legendas, envie cues normalizadas ao núcleo de áudio compartilhado, exponha diagnóstico compreensível e recupere-se por fallback sem quebrar o Coursera.

Depois desse objetivo ser validado, criar uma camada educacional que use os mesmos eventos de cue para oferecer notas sincronizadas, marcadores, flashcards, modo prova e revisão espaçada em qualquer plataforma compatível.

---

## 4. Fora do escopo inicial

A primeira execução não incluirá tradução automática, sincronização em nuvem, conta própria da S·IA, avaliação remota do usuário, publicação comercial do modelo neural, alteração do player da Udemy, automação de cliques, captura de conteúdo fora da aula aberta no navegador ou uma nova implementação de voz.

Também não será criada uma fila de áudio da Udemy, uma cópia do sincronizador, um segundo bridge Piper ou uma versão específica do fallback de áudio. Esses componentes pertencem ao núcleo compartilhado.

---

## 5. Evidências atuais sobre a Udemy

A documentação oficial informa que aulas com legendas exibem um controle de closed captions no player do navegador, com seleção de idioma e opção de desligamento. Também descreve ajustes de fonte, opacidade e posição da legenda. [1]

A documentação oficial descreve uma função de transcrições em painel lateral, com destaque da sentença atual e autoscroll conforme o instrutor fala. Ela informa que o texto utiliza o mesmo idioma selecionado nas legendas. [1]

A documentação também descreve o controle de velocidade no player e atalhos para reprodução, velocidade, seek, volume e anotações. [2] [3]

A documentação da nova experiência de curso indica que a experiência pode variar entre cursos e contas e que funções do player, como áudio, taxa de reprodução e legendas, permanecem no player. Isso torna obrigatório testar mais de uma variante e não tratar posições visuais como contrato permanente. [4]

Essas fontes confirmam comportamentos de produto, mas não confirmam uma API DOM estável ou um contrato público para que uma extensão obtenha a cue ativa. A descoberta técnica deverá ser feita por observação passiva e fixtures controladas.

---

## 6. Hipóteses de investigação

A investigação deverá tratar as possibilidades abaixo como hipóteses, não como fatos.

| ID | Hipótese | Método | Critério de confirmação |
|---|---|---|---|
| UDY-H01 | O vídeo expõe `TextTrack` com cues utilizáveis. | Inspecionar o elemento de mídia em aula autorizada e fixture. | Texto, início e fim corretos em múltiplas cues. |
| UDY-H02 | A legenda ativa aparece no DOM com mudanças observáveis. | Observar mutações sem clicar ou alterar o player. | Cada cue válida aparece uma vez, sem controles misturados. |
| UDY-H03 | O painel de transcrição pode atuar como fallback temporal. | Comparar destaque e autoscroll com o tempo do vídeo. | Correlação repetível entre sentença e instante. |
| UDY-H04 | Cursos/contas podem apresentar variantes de experiência. | Testar layouts disponibilizados ao usuário. | Diagnóstico identifica a variante sem alterar o núcleo. |
| UDY-H05 | Troca de aula recria player, cues ou listeners. | Navegar entre aulas e observar ciclo de vida. | Destruição e reconexão sem duplicar falas. |
| UDY-H06 | Legenda e transcrição podem ter disponibilidade independente. | Alternar idioma, legendas e cursos. | Estado de ausência de fonte é explícito. |

Pelo menos três hipóteses plausíveis deverão ser analisadas antes de escolher a estratégia principal. Quando uma hipótese não puder ser confirmada, ela deverá permanecer marcada como desconhecida.

---

## 7. Fases de execução

### Fase 0 — Congelamento do baseline

O estado 1.8.5 do Coursera será tratado como baseline. Antes de qualquer mudança deverá ser confirmada a versão, o hash do `sync-engine.js`, a presença do fallback DOM, o funcionamento do motor nativo, o funcionamento do Piper experimental e os resultados da regressão.

**Gate:** somente prosseguir se o baseline estiver reproduzível e documentado.

### Fase 1 — Observação passiva da Udemy

Serão avaliadas aulas acessíveis ao usuário, sem síntese, sem alteração de velocidade e sem automação de controles. A investigação observará player, mídia, faixas, transcrição, legenda, pausa, seek, troca de aula, recarga e variantes de experiência.

**Entregável:** relatório de observação com hipóteses, evidências anonimizadas e fontes possíveis.

**Gate:** nenhuma implementação de áudio antes de registrar a fonte principal candidata, as alternativas e as limitações.

### Fase 2 — Contrato do adaptador

Será definido o contrato de plataforma e a cue normalizada. O adaptador deverá informar `platformId`, versão, texto, intervalo temporal, origem, confiança e contexto mínimo da aula.

**Entregável:** contrato testável e fixtures sem conteúdo protegido.

**Gate:** contrato não pode exigir que o núcleo conheça seletores da Udemy.

### Fase 3 — Protótipo Udemy sem áudio

Será implementado apenas o reconhecimento da plataforma, descoberta do player, leitura da fonte principal, ciclo de vida e diagnóstico. O resultado deverá ser verificável por eventos e painel.

**Entregável:** adaptador experimental capaz de emitir cues normalizadas e relatar falhas.

**Gate:** cada cue válida deve ser emitida uma única vez; texto incerto não deve ser falado.

### Fase 4 — Fallback da legenda

Será adicionada uma estratégia secundária somente quando a principal falhar. O diagnóstico deverá registrar `primary`, `dom`, `transcript`, `event` ou outra origem definida pelo adaptador.

**Entregável:** fallback testado, com níveis de confiança e mensagem de compatibilidade reduzida.

**Gate:** o fallback não pode gerar fala silenciosamente quando a confiança for baixa.

### Fase 5 — Integração com o núcleo de áudio

As cues da Udemy serão encaminhadas ao mesmo núcleo utilizado pelo Coursera. Voz nativa, Piper, pré-síntese, cache, fila, sincronização e fallback de áudio não serão duplicados.

**Entregável:** leitura experimental da Udemy usando o núcleo compartilhado.

**Gate:** ativar voz nativa primeiro; somente depois validar Piper e retorno automático ao navegador.

### Fase 6 — Validação multiplataforma

A matriz de testes será executada na Udemy e repetida no Coursera. A validação abrangerá aulas com legendas, ausência de legendas, pausa, seek, troca de aula, recarga, mudança de velocidade, player recriado e falhas de geração neural.

**Entregável:** relatório de compatibilidade, limitações e rollback.

**Gate:** só promover de protótipo para experimental se diagnóstico, fallback, testes e regressão estiverem aprovados.

### Fase 7 — Release experimental

O adaptador será identificado como experimental, com versão própria, limitações claras e flag ou forma de desativação. O Coursera continuará sendo a referência de estabilidade.

**Entregável:** release notes e pacote reproduzível.

### Fase 8 — Camada educacional

Após a compatibilidade mínima, serão implementados recursos que consumam eventos comuns, começando por notas e marcadores e avançando para flashcards, modo prova, revisão espaçada e Tutor Socrático.

**Gate:** cada recurso educacional deve ser desligável sem mudar áudio ou sincronização.

---

## 8. Arquitetura prevista

```text
Udemy / Coursera
        │
        ▼
Adaptador da plataforma
        │ cue normalizada + origem + confiança
        ▼
S·IA Core compartilhado
        ├── sync-engine protegido
        ├── voz nativa
        ├── Piper PT-BR local
        ├── fila e pré-síntese
        └── fallback de áudio
        │
        ├── diagnóstico
        └── camada educacional futura
```

O adaptador não poderá chamar diretamente o Piper, controlar o `AudioContext`, ajustar a velocidade do vídeo para compensar a própria detecção ou manter uma fila paralela.

A camada educacional receberá eventos como `SIA_CAPTION_CHANGED`, `SIA_CUE_COMPLETED` e `SIA_PLATFORM_DETECTED`. Ela não deverá ler o DOM da Udemy nem do Coursera.

---

## 9. Estratégia de diagnóstico

Desde o primeiro protótipo, o painel deverá informar plataforma, adaptador, player, fonte de legenda, confiança, motor de voz e ação recomendada.

| Estado | Mensagem para o usuário |
|---|---|
| Plataforma reconhecida, player aguardando | “Udemy detectada; aguardando o player.” |
| Player encontrado, sem legenda | “Player encontrado; ative uma legenda disponível.” |
| Fonte principal ativa | “Legenda detectada pela fonte principal.” |
| Fallback ativo | “Leitura por compatibilidade: fonte alternativa.” |
| Baixa confiança | “Legenda não confirmada; leitura suspensa.” |
| Piper aquecendo | “Voz neural local preparando o motor.” |
| Fallback de áudio | “Piper indisponível; voz do navegador ativada.” |
| Erro de adaptador | “A S·IA não conseguiu resolver esta aula com segurança.” |

O diagnóstico deverá ser local e não deverá incluir cookies, tokens ou conteúdo de conta.

---

## 10. Estratégia de fallback

A ordem de resolução será definida somente após a observação, mas o princípio será:

```text
Fonte principal confiável?
        ├── sim → validar → emitir cue primary
        └── não → tentar fonte alternativa
                         ├── confiável → emitir cue fallback + diagnóstico
                         └── incerta → suspender fala e orientar o usuário
```

O fallback de legenda é diferente do fallback de áudio. O primeiro procura uma fonte alternativa de texto; o segundo retorna do Piper para a voz nativa. Eles deverão permanecer diagnosticamente separados.

---

## 11. Matriz mínima de testes

### Adaptador Udemy

| Cenário | Resultado esperado |
|---|---|
| Domínio não compatível | Nenhuma interferência. |
| Página Udemy sem player | Estado de espera. |
| Player criado depois | Reconexão sem duplicar listeners. |
| Legenda principal disponível | Cue correta com origem `primary`. |
| Legenda principal indisponível | Fallback identificável. |
| Legenda ausente | Mensagem clara, sem texto inventado. |
| Cue repetida | Uma única emissão. |
| Cue fragmentada | Tratada pelo núcleo comum, sem lógica duplicada. |
| Pausa | Fala e estado respeitam pausa. |
| Seek | Fila e estado são reconciliados. |
| Troca de aula | Contexto anterior é destruído. |
| Player recriado | Adaptador reconecta com segurança. |
| Variante de experiência | Diagnóstico identifica a variante. |

### Núcleo compartilhado

A suíte existente deverá continuar cobrindo motor nativo padrão, ativação Piper, aquecimento, geração, cache, deduplicação, pré-síntese, cancelamento, fallback e contexto invalidado. A nova plataforma não poderá criar uma segunda suíte paralela para testar uma implementação diferente de áudio.

### Regressão Coursera

Toda alteração de manifest, content script, mensagens, listeners, storage, inicialização ou contrato comum deverá repetir os testes do Coursera, mesmo se a alteração tiver sido motivada pela Udemy.

---

## 12. Critérios de aceitação

A integração Udemy somente poderá ser marcada como **experimental** quando:

| Critério | Obrigatório |
|---|---:|
| Adaptador isolado e versionado | Sim |
| Cue normalizada com origem e confiança | Sim |
| Diagnóstico visível | Sim |
| Fallback de legenda | Sim |
| Núcleo de áudio compartilhado | Sim |
| Voz nativa validada | Sim |
| Piper validado, quando habilitado | Sim |
| Fallback Piper → navegador | Sim |
| Testes automatizados | Sim |
| Teste físico em aula autorizada | Sim |
| Regressão do Coursera | Sim |
| Rollback documentado | Sim |
| Limitações divulgadas | Sim |

Para ser **validada**, a integração deverá repetir os cenários em mais de uma aula e variante disponível, manter resultados consistentes e possuir evidência de atualização segura do player.

---

## 13. Riscos e mitigação

| Risco | Impacto | Mitigação |
|---|---:|---|
| Mudança de DOM da Udemy | Alto | Adaptador isolado, múltiplas estratégias e diagnóstico. |
| Fonte de legenda não acessível | Alto | Observação passiva, transcrição como hipótese e suspensão segura. |
| Duplicação de cues | Alto | IDs temporais, deduplicação e testes de ciclo de vida. |
| Recriação do player | Alto | `destroy()` e reconexão controlada. |
| Regressão Coursera | Crítico | Baseline, hash, testes e branch separada. |
| Latência neural | Médio | Núcleo comum, aquecimento e pré-síntese. |
| Licença neural incompleta | Crítico | Release experimental e bloqueio de promessa comercial. |
| Conteúdo protegido em fixtures | Alto | Fixtures sintéticas e sanitização dos relatórios. |
| Mudança silenciosa de plataforma | Alto | Diagnóstico de variante e validação periódica. |

---

## 14. Roadmap educacional pós-compatibilidade

A camada educacional será construída sobre eventos comuns e não sobre seletores de plataforma.

| Ordem | Recurso | Condição de entrada |
|---:|---|---|
| 1 | Notas sincronizadas | Cue e timestamp normalizados. |
| 2 | Favoritos e marcadores | Contexto de curso e aula. |
| 3 | Repetição contextual | Recall e navegação temporal estáveis. |
| 4 | Flashcards manuais | Armazenamento local e exportação. |
| 5 | Flashcards sugeridos | Extração local revisável. |
| 6 | Modo prova | Cartões e ligação com trecho original. |
| 7 | Revisão espaçada | Histórico local e agenda editável. |
| 8 | Glossário contextual | Termos recorrentes e contexto suficiente. |
| 9 | Tutor Socrático | Perguntas testadas e controle de revelação. |
| 10 | Shadowing | Reprodução e reconhecimento opcional. |

Cada recurso deverá ter configuração de desligamento, exclusão de dados, exportação e testes próprios. Nenhum recurso educacional poderá interromper a aula automaticamente sem consentimento ou configuração explícita.

---

## 15. Entregáveis e controle de versão

| Entregável | Local previsto |
|---|---|
| Relatório de observação Udemy | `docs/research/` |
| Contrato de adaptador | `docs/architecture/` e testes do adaptador |
| Adaptador experimental | módulo isolado em `extension/` |
| Fixtures sintéticas | `extension/tests/fixtures/` ou área de testes autorizada |
| Diagnóstico | núcleo de diagnóstico comum |
| Relatório de validação | `docs/reports/` |
| Release notes | `docs/releases/` |
| Decisões | `docs/decisions/` |
| Exceções aprovadas | registro vinculado ao Documento Mestre |

O primeiro protótipo deverá permanecer em branch própria. Uma release experimental deverá usar incremento de versão ou identificador que deixe claro o estado de compatibilidade.

---

## 16. Gates de aprovação

| Gate | Pergunta que deve ser respondida |
|---|---|
| G0 | O baseline Coursera 1.8.5 está reproduzível? |
| G1 | As hipóteses Udemy foram observadas e registradas? |
| G2 | O contrato de cue é independente da plataforma? |
| G3 | O protótipo possui diagnóstico e fallback? |
| G4 | A Udemy usa o núcleo de áudio único? |
| G5 | A regressão Coursera passou? |
| G6 | O rollback e a comunicação de limitações estão prontos? |
| G7 | O usuário aprovou o início da implementação? |

O plano só poderá avançar para implementação depois da aprovação explícita do usuário para o escopo do Gate G7. Esta aprovação não libera alterações extraordinárias em componentes protegidos.

---

## 17. Decisão solicitada ao usuário

Solicita-se aprovação para iniciar **somente a Fase 0 e a Fase 1**, isto é, congelamento do baseline e observação passiva da Udemy. Nenhum código do adaptador será alterado antes de o relatório de observação ser concluído.

A aprovação deverá ser específica para esta etapa. A implementação das Fases 2 a 7 será apresentada novamente depois das evidências da Udemy. A camada educacional será tratada em uma etapa posterior.

### Registro de aprovação

```text
Plano: PLAN-EXECUTION-UDEMY-AND-LEARNING.md
Escopo aprovado: [preencher pelo usuário]
Fases autorizadas: [preencher pelo usuário]
Alteração de componente protegido autorizada: não, salvo exceção formal
Data:
Aprovação explícita:
```

---

## Referências

[1]: https://support.udemy.com/hc/en-us/articles/229605028-How-to-Use-Subtitles-Transcripts-on-a-Browser "Udemy — How to Use Subtitles & Transcripts (on a Browser)"

[2]: https://support.udemy.com/hc/en-us/articles/229231247-How-to-Change-the-Course-Video-Speed "Udemy — How to Change the Course Video Speed"

[3]: https://support.udemy.com/hc/en-us/articles/13687901918999-How-to-Use-Keyboard-Shortcuts "Udemy — How to Use Keyboard Shortcuts"

[4]: https://support.udemy.com/hc/pt/sections/206457187-Reprodutor-do-curso "Udemy — Reprodutor do curso e nova experiência de curso"

[5]: ../governance/MASTER-SIA-EXPANSION.md "Documento Mestre de expansão multiplataforma da S·IA"

[6]: ../architecture/SYSTEM-ARCHITECTURE.md "Arquitetura do sistema S·IA"
