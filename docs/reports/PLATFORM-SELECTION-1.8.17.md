# Relatório técnico — Seletor Seguro de Plataforma 1.8.17

## Objetivo

Construir uma camada aditiva para que o usuário escolha explicitamente a plataforma da aba, com foco no YouTube, sem deixar que um adaptador experimental altere o caminho já funcional do Coursera ou da Udemy. O baseline utilizado foi o commit estável 1.8.14:

```text
068d998c4007fdc13b35d76a9f85567f79b46085
```

O relatório não declara compatibilidade geral com o YouTube. Ele documenta a política de ativação, a separação de contextos, a segurança das cues e os gates que precisam permanecer verdadeiros antes de qualquer evolução.

## Política de seleção

O módulo puro `extension/platform-selection.js` normaliza os modos `auto`, `coursera`, `udemy`, `youtube` e `off`, normaliza domínios e verifica se a escolha é compatível com a URL atual.

| Situação | Estado esperado | Ação do código |
|---|---|---|
| Coursera compatível | `auto` | Mantém o content script e o adaptador atuais. |
| Udemy compatível | `auto` | Mantém o roteador/adaptador Udemy atuais. |
| YouTube `/watch?v=...` sem preferência | `off` | Carrega apenas o bootstrap leve; não injeta o núcleo. |
| YouTube com seleção por aba | `youtube` | Persiste em `chrome.storage.session` e injeta sob demanda. |
| YouTube com seleção por domínio | `youtube` | Persiste em `chrome.storage.local` e injeta sob demanda. |
| URL YouTube Shorts/canal | incompatível | Não injeta e informa estado incompatível. |
| YouTube selecionado em Coursera/Udemy | incompatível | Rejeita a solicitação sem alterar a plataforma atual. |
| Seleção `off` | desligado | Desativa a instância injetada e remove o estado aplicável. |

A prioridade é **aba > sessão do domínio > domínio persistente > padrão seguro**. O evento de carregamento da aba limpa apenas o conjunto em memória de instâncias injetadas; a preferência de domínio permanece, permitindo que o bootstrap reavalie a seleção após a recarga.

## Separação de contextos

O `platform-selection-bootstrap.js` é o único content script estático do YouTube. Em `document_start`, ele apenas solicita ao service worker a avaliação da seleção atual. A decisão de injetar não fica no script da página.

Após uma escolha compatível, o service worker executa duas injeções controladas:

| Mundo | Arquivos | Responsabilidade |
|---|---|---|
| MAIN | `youtube-caption-parser.js`, `youtube-caption-bridge.js` | Observar a configuração de captions e recuperar cues temporais same-origin. |
| ISOLATED | `sync-engine.js`, `neural-tts/piper-bridge.js`, `caption-input.js`, `content.js`, roteador, diagnóstico e `youtube-host.js` | Reutilizar o núcleo comum de fala, fila, sincronização, Piper, pré-síntese e fallback. |

O mundo MAIN não compartilha globais JavaScript com o mundo ISOLATED por desenho do Chrome. A comunicação entre eles usa eventos `postMessage` com origem validada; portanto, a ausência de uma global MAIN quando consultada no ISOLATED não é falha de injeção.

## Segurança de cues

O contrato `youtube-adapter-contract.js` marca uma cue como segura somente quando há texto não vazio, `startTime` e `endTime` finitos, duração positiva, fonte permitida e confiança alta. A integração do `content.js` ainda exige `safeToSpeak: true`, `sourceConfidence: "high"` e tempos confirmados antes de encaminhar a cue para o núcleo de voz.

Texto capturado somente de overlay visual, DOM sem timing ou transcrição não confirmada fica em `UNSAFE_TO_SPEAK` e não é lido automaticamente. O parser aceita JSON3 com prefixo XSSI e WebVTT; o agregador une microcues progressivas e remove repetições. A seleção linguística prioriza `pt-BR`, depois `pt` genérico e só então outra faixa disponível com tradução configurada para `pt`.

## Validação automatizada

A suíte completa foi executada a partir de `extension/` com 81 testes aprovados e nenhuma falha. O teste comportamental do popup cobre a escolha `youtube`, a atualização periódica de status, a aplicação por aba e a fixação por domínio. Os testes específicos do novo caminho cobrem:

| Grupo | Cobertura |
|---|---|
| Seleção pura | Domínio, modos, URL suportada, Shorts/canais, incompatibilidade e padrão YouTube desligado. |
| Contrato YouTube | Cues temporais, confiança, fontes permitidas e `safeToSpeak`. |
| Parser/agregador | JSON3/XSSI, WebVTT, microcues, deduplicação e rejeição de timing ausente. |
| Adapter | TextTrack temporal, detecção do vídeo e ausência de áudio próprio. |
| Bridge | Prioridade direta de `pt-BR` sobre `pt` genérico. |
| Service worker | Bloqueio default, injeção MAIN/ISOLATED, override por aba, mismatch, reload e off. |
| Regressão existente | Sync engine, Piper bridge, offscreen, core integration, caption input, router e hooks atuais. |

Também foram executados `node --check` nos arquivos alterados, parse do manifesto com `JSON.parse` e `git diff --check` sem ocorrências.

## Correção do popup

O popup fazia uma nova leitura assíncrona da seleção a cada segundo. Durante uma escolha ainda não aplicada, essa leitura podia re-renderizar o `<select>` com o valor persistido anterior (`off`) antes do clique do usuário. O mesmo padrão podia desfazer o checkbox de fixação por domínio.

A correção mantém um estado local de seleção em edição (`platformSelectionDirty`) até a resposta de aplicação. Enquanto esse estado está ativo, as atualizações de diagnóstico continuam possíveis, mas não sobrescrevem a escolha visível. O checkbox agora atualiza explicitamente o escopo (`tab` ou `domain`) e também fica protegido contra o re-render concorrente. Depois de uma aplicação bem-sucedida, a seleção é confirmada, a aba é recarregada e o popup recupera o valor persistido pelo service worker.

## Validação física em Chromium isolado

O teste foi executado em perfil temporário, sem tocar no navegador normal do usuário. A sequência corrigida foi feita depois de limpar `sia_platform_selections` e `sia_platform_tab_selections`.

| Fase | Evidência observada |
|---|---|
| YouTube default | `chrome.tabs.sendMessage` não encontrou receptor: não houve content script ou injeção do adaptador. |
| Seleção de domínio | Após definir `youtube.com: youtube` e recarregar, o status retornou `platformId: youtube`, `platformActive: true`, `videoFound: true` e `syncEngineReady: true`. |
| YouTube off | Após definir `youtube.com: off` e recarregar, o receptor deixou de existir; a instância não permaneceu ativa. |
| Udemy fixture | Em HTTPS local com host mapeado, `platformId: udemy`, `player: found`, `source: texttrack`, `confidence: high`, `state: PRIMARY_READY` e `safeToSpeak: true`. |
| Baseline Udemy | A mesma fixture produziu o mesmo diagnóstico com a extensão 1.8.14, sem diferença observada. |

A fixture Udemy contém vídeo, TextTrack e nenhuma conta ou aula real. O teste físico Coursera permanece o baseline já validado; nenhum arquivo do caminho estático Coursera foi substituído pela camada YouTube.

## Integridade do núcleo protegido

Os hashes verificados depois dos testes foram:

| Componente | SHA-256 |
|---|---|
| `extension/sync-engine.js` | `8c2e9ad28c1c570e44d4c3c42148ada403dec696864bd21675aedd2d6d9bef00a` |
| `extension/offscreen.js` | `bb0f094c7b529dd46ead561d865765c7c76519293c7dcefb34c05f0df15eb17d` |
| `extension/neural-tts/piper-bridge.js` | `0a3a1fa7ab78bd13f040f4a33aed330fd48b8f5b5209238338f621c1e3c4c6b8` |

Esses valores coincidem com o baseline protegido. A 1.8.16 não foi aplicada inteira porque sua auditoria reproduziu perda de pré-síntese da primeira cue do Coursera e perda do encaminhamento `silenceScale` ao Worker Piper.

## Empacotamento

O arquivo `extension/dist/sia-extension-1.8.17.zip` contém 43 arquivos da allowlist, com caminhos de subdiretório preservados. O pacote inclui o bootstrap, o seletor, os módulos YouTube, o núcleo comum, ícones e runtime neural; não inclui testes, fixtures ou documentação. O resultado foi verificado com `unzip -t` sem erros.

O script `extension/scripts/package-extension.ps1` também foi corrigido para criar os diretórios de destino antes de copiar arquivos aninhados. Isso evita que caminhos como `platform-adapters/youtube/` sejam achatados no staging do PowerShell.

## Riscos ainda abertos

O YouTube continua sujeito a mudanças no formato de captions, configuração do player, navegação SPA e disponibilidade de faixas temporais. O teste executado prova o gate e a integração inicial, não todas as variantes de player nem a qualidade da fala em todos os vídeos.

A redistribuição comercial do runtime, dos pesos neurais e dos componentes de fonemização continua dependendo da auditoria de licenças. O projeto não deve fazer alegação de licença comercial irrestrita enquanto essa pendência não for formalmente resolvida.

## Conclusão e próximo gate

A fatia 1.8.17 atende ao objetivo de ativação manual segura: YouTube não inicia sozinho, a escolha é compatível com a página, a desativação é reversível e o áudio continua centralizado. O próximo gate deve ser uma validação manual de captions e fala em uma amostra controlada de vídeos YouTube, sempre com registro de fonte, confiança, timing e fallback, antes de qualquer declaração pública de compatibilidade.
