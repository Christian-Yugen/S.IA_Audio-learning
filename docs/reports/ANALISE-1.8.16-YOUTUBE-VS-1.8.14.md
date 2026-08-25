# Auditoria da S·IA 1.8.16 YouTube versus baseline estável 1.8.14

**Autor:** Manus AI

**Data:** 25 de agosto de 2026

**Objetivo:** analisar o relatório e o pacote `sia-extension-1.8.16-youtube-experimental.zip` enviados pelo responsável, identificar o que funcionou, localizar as regressões que motivaram o retorno à 1.8.14 e definir uma reconstrução segura do YouTube.

## Decisão executiva

A 1.8.16 não deve ser instalada nem aplicada integralmente sobre a 1.8.14. Ela contém uma implementação YouTube tecnicamente relevante, mas também altera o `content.js` compartilhado e reintroduz uma regressão no `offscreen.js`. O pacote deve ser tratado como **fonte experimental de componentes YouTube**, não como release substituta do baseline estável.

A decisão segura é reaproveitar, depois de revisão e testes próprios, os módulos YouTube isolados — parser, contrato, agregador, adapter, bridge e host — e reconstruir a fronteira de integração sobre a 1.8.14. O `content.js`, o `offscreen.js`, o `manifest.json` e qualquer outro componente comum não devem ser copiados da 1.8.16 sem uma comparação específica e aprovação do escopo.

## Estados comparados

| Estado | Identificação | Tratamento |
|---|---|---|
| Baseline estável | Branch remota `main`, commit `068d998c4007fdc13b35d76a9f85567f79b46085`, manifesto 1.8.14 | Fonte oficial protegida |
| Tentativa YouTube | ZIP enviado `sia-extension-1.8.16-youtube-experimental.zip`, SHA-256 `d0421f3c8d9684b51bee06f63a7c2704d4a4520f62f035c4ff98da8a908673bd` | Material experimental para auditoria |
| Núcleo protegido | `sync-engine.js`, SHA-256 `8c2e9ad28c1c570e44d4c3c42148ada403dec696864b21675aedd2d6d9bef00a` nos dois estados | Não modificar |

## Validação executada

A análise foi feita em cópia temporária e sem publicação. O código da 1.8.16 passou na checagem sintática dos arquivos principais. Ao reutilizar a suíte de regressão do baseline, com o contrato Udemy incluído corretamente no harness, foram executados 78 testes: 76 passaram e 2 falharam.

| Teste que falhou | Resultado | Interpretação |
|---|---:|---|
| `Coursera prepara a primeira cue antes de ela aparecer sem falar antecipadamente` | Falhou: esperado 1, obtido 0 | A 1.8.16 removeu o caminho de pré-cache da primeira cue que existia na 1.8.14. |
| `offscreen encaminha silenceScale para o worker Piper` | Falhou: esperado `0.08`, obtido `undefined` | A 1.8.16 deixou de encaminhar `silenceScale` ao Worker Piper, regressão independente da expansão YouTube. |

A primeira execução do harness apresentou também um erro de montagem porque o teste Udemy dependia de um contrato que não fazia parte do ZIP de distribuição. Esse erro foi corrigido somente no harness, e a suíte repetida confirmou que as falhas reais eram exatamente as duas acima.

## Diferenças críticas encontradas

### `content.js` compartilhado

A 1.8.16 não apenas acrescentou arquivos YouTube. Ela modificou o script compartilhado do núcleo:

| Alteração | Risco |
|---|---|
| `PLATAFORMA_EXTERNA` passou a incluir YouTube | Coursera, Udemy e YouTube passaram a compartilhar um novo caminho condicional dentro do mesmo arquivo. |
| `PLATAFORMA_EXTERNA_ID` foi introduzido | A lógica comum passou a depender de identificação de plataforma dentro do núcleo. |
| `continuaSemPontuacaoFinal()` foi removida do início do arquivo | O comportamento estável usado para pausa/prosódia foi substituído por outro fluxo e deixou de ser idêntico ao baseline. |
| `obterLegendaAtivaParaPrecache()` e o pré-cache no intervalo anterior foram removidos | A primeira cue deixa de ser preparada no caso coberto pelo teste que falhou. |
| cálculo adicional de taxa para continuação sem pontuação foi introduzido | Pode alterar sincronização do Coursera mesmo quando a alteração foi motivada pelo YouTube. |
| fontes `youtube-track` e `youtube-aggregated` foram aceitas pelo caminho externo | O núcleo de produção passou a receber um formato novo antes da estabilização isolada do adaptador. |
| contexto de `falar()` recebeu propriedades YouTube e prosódia | Mais acoplamento da regra específica YouTube ao caminho comum. |

Além disso, o manifesto da 1.8.16 inclui `youtube.com` sem `www`, mas a expressão de plataforma no `content.js` considera somente `www.youtube.com` e `m.youtube.com`. Isso cria uma inconsistência: em `https://youtube.com/watch?v=...` o host YouTube pode ser carregado, enquanto o núcleo não o reconhece como plataforma externa.

### `offscreen.js`

A 1.8.14 encaminhava `silenceScale` para o Worker Piper, usando valor recebido ou fallback `0.2`. A 1.8.16 removeu essa propriedade do payload. O teste do baseline demonstrou a regressão com valor esperado `0.08` e retorno `undefined`.

Esse arquivo é parte do núcleo neural compartilhado por Coursera e Udemy. Ele não deve ser substituído pela cópia da 1.8.16. Qualquer reconstrução YouTube deve partir do `offscreen.js` estável da 1.8.14.

### `manifest.json`

A 1.8.16 adicionou dois blocos de content script para o YouTube: um no mundo `MAIN`, para parser/bridge, e outro no mundo isolado, para núcleo/host. O desenho é tecnicamente coerente com a necessidade de separar o estado da página da extensão, porém a alteração aumenta o escopo do manifesto e injeta o Piper em páginas YouTube antes de o caminho ter sido promovido.

Também foram adicionados matches para `www.youtube.com`, `m.youtube.com` e `youtube.com`, enquanto os recursos acessíveis usam `*.youtube.com` e `youtube.com`. Antes de incorporar isso à release, será preciso reduzir o escopo ao formato autorizado, revisar privacidade e cobrir todos os hosts realmente suportados.

O manifesto pode ser reaproveitado somente como referência de desenho. Ele não deve ser aplicado sobre a 1.8.14 sem um pacote experimental próprio, branch separada e rollback simples.

## Componentes YouTube da 1.8.16

| Componente | Valor técnico | Risco principal | Decisão preliminar |
|---|---|---|---|
| `youtube-caption-parser.js` | Puro, suporta JSON3/XSSI, XML e VTT, com limites e normalização | Dados vindos de formatos variados precisam de fixtures | Reaproveitar após testes próprios |
| `youtube-adapter-contract.js` | Define estados, fontes, confiança, cue e diagnóstico | Host/ID precisam ser mantidos coerentes com manifesto | Reaproveitar com revisão |
| `youtube-caption-aggregator.js` | Deduplica e une microcues progressivas | Heurísticas podem juntar frases indevidamente | Reaproveitar somente com testes de falsos merges |
| `youtube-adapter.js` | Lida com player, TextTrack, anúncio, SPA, overlay e cues externas | Polling de 120 ms, acesso a estado e agregação complexos | Reaproveitar em área experimental e testar isoladamente |
| `youtube-caption-bridge.js` | Descobre tracks, busca timedtext em memória e envia snapshot | Depende de objetos internos, URL dinâmica e `fetch` na origem da página | Reaproveitar apenas com hardening |
| `youtube-host.js` | Valida `postMessage`, handshake, replay e entrega ao adapter | Fronteira MAIN/isolated e ciclo de vida precisam de testes SPA | Reaproveitar após fixtures de segurança |

## Risco específico de Português brasileiro

A ponte da 1.8.16 usa `TARGET_LANGUAGE = 'pt'` e seleciona a primeira track cujo idioma começa com `pt`. Em uma resposta pública analisada, havia `pt` e `pt-BR`; o algoritmo pode escolher `pt` antes de `pt-BR`. Isso não satisfaz a exigência de Português brasileiro explícito.

A reconstrução deverá priorizar exatamente `pt-BR`, depois `pt`, e somente então uma track de outro idioma com tradução explicitamente marcada como provisória. A seleção deverá registrar idioma original, idioma solicitado e origem no diagnóstico. A tradução automática do YouTube não deverá ser apresentada como legenda profissional nem como garantia de fidelidade.

## O que funcionou e deve ser preservado

A 1.8.16 demonstrou uma direção correta ao manter o áudio no núcleo compartilhado. O bridge não cria `speechSynthesis`, `AudioContext`, fila neural ou Piper próprios. O host valida origem, vídeo, track, confiança e intervalos antes de enviar cues. O overlay sem timing permanece bloqueado. O agregador reduz duplicação de microcues e reseta diante de anúncios, troca de vídeo e mudança de fonte.

Esses princípios são aproveitáveis, mas a implementação precisa ser separada do `content.js` estável até que exista um contrato seguro para integração. O YouTube deve primeiro emitir e diagnosticar cues numa área experimental; somente depois poderá entrar na extensão carregável com uma alteração mínima e reversível do manifesto e do hook de plataforma.

## Reconstrução segura proposta

A ordem recomendada é:

1. Preservar a 1.8.14 intacta como referência e não copiar `content.js` ou `offscreen.js` da 1.8.16.
2. Criar uma branch experimental baseada no commit remoto 1.8.14.
3. Adicionar o parser, contrato e agregador YouTube com testes puros, sem manifesto e sem áudio.
4. Adicionar fixtures sintéticas para JSON3, XML, VTT, microcues, duplicatas, anúncios, troca de vídeo e texto sem timing.
5. Adicionar bridge/host em um protótipo isolado, com `postMessage` validado, sem falar texto de baixa confiança.
6. Integrar a cue ao `SiaCaptionInput` somente por um contrato externo comum, sem criar fila, provider ou sincronizador novo.
7. Preservar literalmente o comportamento da 1.8.14 no Coursera e repetir a regressão Coursera/Udemy a cada etapa.
8. Só então preparar um pacote YouTube experimental, com o YouTube desligável e rollback para 1.8.14.

A primeira implementação integrada deverá preferir uma adição pequena e explícita à camada de roteamento de plataformas, em vez de inserir condicionais YouTube em toda a lógica do `content.js`. Se isso não for possível sem modificar componente protegido, a alteração deverá parar e ser apresentada como exceção para aprovação.

## Conclusão

O retorno à 1.8.14 foi correto. A 1.8.16 trouxe uma base promissora para o YouTube, mas não é uma release equilibrada porque falha em duas regressões reproduzíveis do núcleo e mistura mudanças de plataforma com mudanças de sincronização/prosódia.

O caminho seguro não é abandonar o YouTube; é **desmontar a 1.8.16 em componentes isolados, recuperar somente o que passou por evidência, corrigir a seleção PT-BR, manter `silenceScale` e o pré-cache da 1.8.14, e integrar em fatias pequenas com regressão obrigatória**.

Nenhuma alteração no Coursera, no Udemy, no `sync-engine.js`, no `offscreen.js` estável ou na fila de áudio está autorizada por esta análise. A implementação seguinte deverá ser apresentada como um incremento delimitado, com testes e rollback próprios.
