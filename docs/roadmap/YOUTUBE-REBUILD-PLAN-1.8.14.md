# Plano de reconstrução segura do YouTube sobre a S·IA 1.8.14

**Status:** proposta para aprovação; nenhum código de produção alterado por este documento.

**Baseline:** `main` remoto na S·IA 1.8.14, commit `068d998c4007fdc13b35d76a9f85567f79b46085`.

**Origem da análise:** pacote experimental `sia-extension-1.8.16-youtube-experimental.zip` e relatório enviado pelo responsável.

## 1. Decisão de base

A 1.8.14 continuará sendo a referência de estabilidade. A 1.8.16 será usada como fonte de componentes YouTube e evidências, mas não será aplicada integralmente. O objetivo é recuperar a capacidade YouTube sem repetir as regressões de pré-cache Coursera e `silenceScale` Piper encontradas na comparação.

> **A reconstrução será por fatias isoladas, não por substituição da versão estável.**

## 2. Componentes protegidos

Os componentes abaixo devem permanecer literais ao baseline, salvo exceção aprovada pelo Documento Mestre:

| Componente | Regra |
|---|---|
| `sync-engine.js` | Hash `8c2e9ad28c1c570e44d4c3c42148ada403dec696864b21675aedd2d6d9bef00a`; não modificar. |
| Caminho Coursera em `content.js` | Não alterar sincronização, pré-cache, fila, velocidade ou fallback existentes. |
| `offscreen.js` | Preservar encaminhamento de `silenceScale` e comportamento do Worker Piper. |
| Provider Piper e Worker | Não criar provider, fila, Worker ou `AudioContext` paralelo para YouTube. |
| Udemy | Não remover nem alterar o adaptador funcional/experimental existente durante a primeira fatia YouTube. |
| Voz nativa | Continuar disponível e ser o primeiro caminho de validação. |

## 3. Componentes candidatos à recuperação

Os arquivos YouTube puros e isolados da 1.8.16 podem ser recuperados em uma branch própria após revisão:

| Componente | Primeira função |
|---|---|
| `youtube-caption-parser.js` | Converter JSON3, XML e VTT em cues temporais finitas. |
| `youtube-adapter-contract.js` | Definir estados, fontes, confiança, identidade e diagnóstico. |
| `youtube-caption-aggregator.js` | Unir microcues progressivas sem duplicar palavras ou frases. |
| `youtube-caption-bridge.js` | Descobrir e obter timedtext somente em memória, com rejeição de conteúdo obsoleto. |
| `youtube-host.js` | Validar fronteira MAIN/isolated, replay, origem, vídeo e intervalos. |
| `youtube-adapter.js` | Observar o player, TextTrack, anúncio, SPA e fallback sem decidir áudio. |

A recuperação não será considerada aprovação automática. Cada componente terá testes e poderá ser removido isoladamente.

## 4. Ordem de implementação

### YR-0 — Branch e congelamento

Criar branch baseada no commit estável 1.8.14. Salvar hashes do `sync-engine.js`, `content.js`, `offscreen.js`, `service-worker.js` e provider Piper. Nenhuma alteração deve ocorrer em `main` durante o desenvolvimento.

### YR-1 — Parser e contrato, sem extensão carregável

Adicionar apenas parser, contrato, agregador e testes puros em `experimental/youtube-adapter`. Não adicionar YouTube ao manifesto, não executar bridge e não emitir áudio.

**Gate:** parser cobre JSON3/XSSI, XML, VTT, texto vazio, tempos inválidos, limite de cues e normalização. O agregador cobre prefixo, sufixo, microcue repetida, pontuação, gap máximo, anúncio e troca de vídeo.

### YR-2 — Adapter e fixture, sem áudio

Adicionar adapter e fixtures sintéticas com `documentRef`, vídeo falso, `TextTrack`, overlay, mudança de URL, troca de player, pausa, seek, anúncio e player recriado. O resultado deve ser somente diagnóstico e cue normalizada.

**Gate:** cue temporal de alta confiança é emitida uma única vez; overlay sem timing vira `UNSAFE_TO_SPEAK`; nenhuma chamada a Piper, `speechSynthesis`, fila ou `AudioContext` é permitida.

### YR-3 — Bridge/host isolados

Adicionar a ponte MAIN e o host isolado somente depois dos gates anteriores. A ponte poderá buscar timedtext na origem do vídeo, mas não poderá persistir URL assinada, cookies, tokens ou conteúdo fora da memória da sessão. O host deverá validar `origin`, `videoId`, `trackKey`, origem, confiança, texto, limites e intervalos.

**Gate:** respostas atrasadas não entram no vídeo atual; replay é idempotente; erro de fetch gera diagnóstico e não fala overlay; a seleção prioriza `pt-BR` explicitamente antes de `pt`.

### YR-4 — Integração de voz nativa

Somente após o usuário aprovar a integração, adicionar o menor hook necessário para encaminhar uma cue YouTube válida ao `SiaCaptionInput` e ao núcleo existente. O primeiro teste será sempre com voz nativa. Nenhuma lógica YouTube de velocidade, fila ou áudio entrará no núcleo.

**Gate:** Coursera e Udemy passam a mesma regressão antes e depois; YouTube pode ser desligado sem alterar os dois caminhos existentes; rollback retorna à 1.8.14.

### YR-5 — Piper e fallback de áudio

Depois da voz nativa, testar o Piper compartilhado e o retorno para browser. O `offscreen.js` deve permanecer o do baseline, incluindo `silenceScale`. Falha neural não deve ser confundida com falha de legenda.

**Gate:** Piper usa provider/fila únicos, não cria rede de inferência, preserva aquecimento/pré-cache e retorna ao navegador quando necessário.

### YR-6 — Manifesto experimental

Somente com YR-0 a YR-5 aprovados, incluir os matches YouTube estritamente necessários no manifesto de uma release experimental. A extensão deverá informar que o recurso é experimental e oferecer desligamento/rollback.

## 5. Seleção de Português brasileiro

A seleção de tracks deve seguir esta ordem:

1. `pt-BR` ou equivalente explícito brasileiro;
2. `pt` somente quando o Brasil não estiver disponível, com diagnóstico indicando fallback de idioma;
3. outro idioma somente para investigação ou tradução provisória, nunca como se fosse PT-BR nativo.

A experiência da extensão deverá deixar claro idioma original, idioma solicitado, se a faixa é automática e a fonte temporal utilizada.

## 6. Critérios de não regressão

A alteração será imediatamente rejeitada se ocorrer qualquer uma destas condições:

| Condição | Ação |
|---|---|
| Hash protegido muda sem exceção aprovada | Reverter e interromper. |
| Teste Coursera falha | Reverter a fatia e investigar antes de continuar. |
| Teste Udemy falha | Reverter a fatia e preservar a versão anterior. |
| `silenceScale` desaparece do payload Piper | Reverter imediatamente. |
| Primeira cue Coursera deixa de ser pré-sintetizada | Reverter imediatamente. |
| Texto YouTube sem timing é falado | Rejeitar o protótipo. |
| Resposta antiga é entregue ao vídeo novo | Rejeitar o bridge/host. |
| Falta diagnóstico ou fallback | Não promover a release. |

## 7. Evidências mínimas antes de promoção

Antes de solicitar promoção para experimental, deverão existir testes automatizados do parser, agregador, adapter, bridge, host e integração; fixture sintética reproduzível; teste físico em vídeo público autorizado com captions; repetição em pelo menos dois vídeos; teste de anúncio, seek, pause e troca de vídeo; regressão completa do Coursera e Udemy; relatório de limitações; e rollback documentado.

Nenhuma evidência de fixture substitui silenciosamente o teste físico. Quando o player real não oferecer relógio ou cue temporal, o resultado correto será `UNSAFE_TO_SPEAK`, não uma inferência otimista.

## 8. Aprovação solicitada

A decisão recomendada é autorizar somente a **YR-0 e YR-1**, isto é, criação da branch experimental e adição dos componentes puros/testáveis do YouTube, sem alteração do manifesto, `content.js`, `offscreen.js`, `sync-engine.js`, Udemy, Coursera ou caminho de áudio.

A autorização para YR-2, YR-3, YR-4, YR-5 e YR-6 deverá ser reapresentada após os gates anteriores, com os resultados anexados.

```text
Plano: YOUTUBE-REBUILD-PLAN-1.8.14.md
Escopo inicialmente autorizado: [preencher]
Fases autorizadas: [preencher]
Alteração de componentes protegidos: não
Aprovação explícita: [preencher]
Data: [preencher]
```

## Referências

- [Documento Mestre](../governance/MASTER-SIA-EXPANSION.md)
- [Análise 1.8.16 versus 1.8.14](../reports/ANALISE-1.8.16-YOUTUBE-VS-1.8.14.md)
- [Pesquisa oficial inicial YouTube](../research/YOUTUBE-OFFICIAL-RESEARCH.md)
- [Especificação do adaptador YouTube](../architecture/YOUTUBE-ADAPTER-DESIGN.md)
