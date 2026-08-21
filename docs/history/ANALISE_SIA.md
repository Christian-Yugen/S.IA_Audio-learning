# Análise técnica da extensão S·IA

**Escopo analisado:** arquivo `tts-extension.zip`, extraído em `extracted/tts-extension`, incluindo código-fonte, manifesto, testes, documentação e artefatos de distribuição.

## 1. Conclusão executiva

A **S·IA** é uma extensão Google Chrome para transformar as legendas de aulas do Coursera em fala sintetizada localmente. Ela injeta dois scripts na página do Coursera: `sync-engine.js`, que contém regras matemáticas e linguísticas puras, e `content.js`, que controla a detecção de vídeo/legendas, a fila de fala, a sincronização temporal, o histórico e o recurso de repetição. O produto não é um sistema de inteligência artificial conectado a um servidor: no estado atual, ele usa a **Web Speech API** do navegador e não possui backend, conta de usuário ou API externa de IA. Essa finalidade está declarada no manifesto e na documentação do projeto. [1] [2] [3]

Na prática, o fluxo é: localizar um elemento `<video>`; ler as legendas nativas por `TextTrack.activeCues`; usar seletores do DOM como fallback; validar e unir fragmentos; remover sobreposições; calcular uma taxa de fala compatível com o intervalo disponível; enviar um `SpeechSynthesisUtterance` para a fila nativa do navegador; e registrar a frase em `chrome.storage.local`. O usuário controla idioma, voz, velocidade, tom, volume e estratégia de sincronização pelo pop-up, enquanto o **S·IA Companion** permite revisar, repetir, favoritar, anotar e exportar frases. [2] [4] [5]

Em termos de maturidade, o núcleo matemático está bem isolado e possui **15 testes automatizados aprovados**, além de checagem sintática bem-sucedida para os cinco scripts JavaScript. Entretanto, o projeto reconhece que popup, Companion, Recall, armazenamento e integração real com o player ainda têm cobertura automatizada limitada. [6] [3]

## 2. O que a extensão é — e o que não é

| Aspecto | Constatação |
|---|---|
| Produto | Extensão Chrome de leitura de legendas para aulas do Coursera. |
| Saída principal | Voz sintetizada pela API `speechSynthesis` do próprio navegador/dispositivo. |
| Processamento | Local, sem chamadas de rede no código executável analisado. |
| Interface | Pop-up de configuração e painel lateral nativo de revisão. |
| Escopo de página | Páginas HTTPS compatíveis com `*.coursera.org`. |
| Persistência | Preferências, perfis por curso e histórico local em `chrome.storage.local`. |
| Recurso de aprendizagem | Replay por timestamp, favoritos, anotações e exportação Markdown. |
| Inteligência artificial externa | Não existe na versão 1.7.0; “AI-powered” aparece como branding, não como integração técnica. |
| Conta ou nuvem | Não existe conta, sincronização entre computadores ou backup automático. |

A documentação chama a proposta de “audio-learning”, mas o mecanismo atual é essencialmente **leitura automática de texto por síntese de voz**. Os recursos de tradução, explicação de trechos, resumos, perguntas de revisão e vozes neurais aparecem apenas como roadmap futuro, não como funcionalidades presentes. [3]

## 3. Arquitetura geral

A extensão usa **Manifest V3** e JavaScript nativo. O manifesto declara o pop-up, o service worker, o painel lateral, o atalho de replay e os content scripts. O script de conteúdo é executado somente em URLs `https://*.coursera.org/*`, com `sync-engine.js` carregado antes de `content.js`, para que o segundo encontre `globalThis.SiaSyncEngine`. [1]

| Componente | Responsabilidade real |
|---|---|
| `manifest.json` | Identidade, versão 1.7.0, permissões, ícones, pop-up, service worker, side panel, comando e injeção dos scripts. |
| `content.js` | Controlador da aula: detecção de vídeo/legenda, montagem do texto, TTS, sincronização, ajuste de playback rate, histórico, Recall e mensageria. |
| `sync-engine.js` | Funções puras para duração estimada, pontuação, preparação prosódica, deduplicação e taxas adaptativas. |
| `popup.html/js/css` | Configuração de voz, idioma, velocidade, tom, volume, estratégia, estado da página, teste de voz, replay e abertura do Companion. |
| `sidepanel.html/js/css` | Histórico da aula, frase atual, replay granular, favoritos, notas, filtro, exportação e limpeza. |
| `service-worker.js` | Recebe o atalho `Alt+Shift+R`, localiza a aba ativa e encaminha a mensagem de replay. |
| `tests/sync-engine.test.js` | Testa somente o motor puro, com 15 casos. |
| `scripts/package-extension.ps1` | Empacota uma versão de distribuição usando allowlist de arquivos. |
| `icons/` | Ícones declarados no manifesto. |
| `README.md`, `PRIVACY.md`, `RELATORIO_TECNICO_SIA.md` | Documentação e compromissos declarados do produto. |

O diagrama funcional pode ser resumido assim:

```text
Coursera: vídeo + TextTracks + DOM de legendas
                  │
                  ▼
content.js ──► validação ──► montagem/deduplicação ──► fila SpeechSynthesis
    │                    │                         │
    │                    ▼                         ▼
    │              sync-engine.js          chrome.storage.local
    │                                              │
    ├──────── mensagens ───────► popup             │
    ├──────── mensagens ───────► Companion         │
    └◄──────── service worker ◄── atalho Replay ───┘
```

## 4. Fluxo de execução na aula

### 4.1 Inicialização

Quando o documento termina de carregar, `iniciarSia()` conecta os listeners de configuração, carrega o histórico associado ao caminho da página, inicia um `setInterval` de 75 ms e registra uma rotina de interrupção para `pagehide`. O script escreve uma mensagem de diagnóstico no console, mas não cria uma UI própria dentro do Coursera. [2]

A chave do histórico é formada por `sia_history_` mais uma versão normalizada de `location.pathname`. Isso significa que as frases ficam separadas por caminho de aula, mas não por query string ou hash. Cada frase é limitada a um histórico de 60 entradas por caminho. [2]

### 4.2 Localização e leitura das legendas

A cada ciclo, o código procura o primeiro `<video>` da página. Se não houver vídeo, ou se o vídeo mudar, a fala pendente é interrompida e o estado é reiniciado. A reprodução pausada, finalizada ou retrocedida também interrompe a fila atual. [2]

A fonte prioritária é a API `TextTrack`: o código percorre faixas de `subtitles` e `captions`, lê `activeCues`, extrai `cue.text` e preserva `startTime`/`endTime`. Como essa fonte não contém botões ou relógios da interface, ela evita grande parte dos falsos positivos. [2]

Quando não há uma cue nativa utilizável, o fallback procura elementos dentro da raiz provável do player, usando seletores como `video-captions`, `VideoCaptions`, `caption-display`, `subtitle-container`, `shaka-text-container` e `vjs-text-track-display`. O filtro exige visibilidade, pelo menos duas letras Unicode, tamanho mínimo de quatro caracteres e rejeita textos que parecem relógios ou rótulos de controle, como “play”, “pause”, “volume” e “fullscreen”. [2]

### 4.3 Montagem e deduplicação

Uma legenda de vídeo pode publicar a mesma frase em várias cues ou dividir uma sentença em fragmentos. A função `unirFragmentosSemRepetir()` compara o final do texto já acumulado com o início do novo fragmento e combina somente a parte que não se sobrepõe. Se o novo bloco for uma versão cumulativa do anterior, a versão mais extensa substitui a anterior. [2]

No modo `TextTrack`, o código pode antecipar até seis cues futuras quando ainda não encontrou pontuação final. A antecipação é limitada a 280 caracteres e a aproximadamente 12 segundos desde o início da cue. A intenção é formar uma sentença natural antes de pronunciá-la, sem deixar a fala excessivamente fragmentada. [2]

No fallback DOM, o texto precisa permanecer estável por 50 ms. Fragmentos sem ponto final são acumulados até surgir pontuação, até o limite de 280 caracteres ou até 12 segundos. A fala não é cancelada apenas porque a cue desapareceu; isso evita cortar uma sentença já iniciada. [2]

### 4.4 Preparação para síntese

Antes de criar a fala, o texto é normalizado. Quando não termina com pontuação final, `prepararTextoParaSintese()` acrescenta uma vírgula. Isso funciona como uma instrução prosódica para o motor de voz tratar o bloco como continuação, reduzindo a entonação de encerramento entre utterances. [2] [4]

O código cria um `SpeechSynthesisUtterance`, configura idioma, voz selecionada, taxa, pitch e volume, e o envia a `speechSynthesis.speak()`. O navegador é responsável pela voz concreta disponível no sistema operacional. A extensão não gera áudio por servidor nem baixa modelos de voz. [2] [3]

### 4.5 Fila e transições

A estratégia de transição evita chamar `speechSynthesis.cancel()` em cada troca normal de legenda. Em vez disso, a extensão mantém uma fala em execução, uma fala enfileirada e uma única `legendaReserva` com a atualização mais recente. Quando a fala atual começa, a reserva pode ocupar a fila nativa. Esse desenho reduz cortes, reinícios e gagueira durante a passagem entre cues. [2] [4]

A extensão também elimina uma sobreposição inicial entre o texto novo e o texto em fala, enfileirado, reservado ou concluído recentemente. O objetivo é impedir que as últimas palavras de uma cue sejam pronunciadas novamente na próxima. [2]

### 4.6 Sincronização adaptativa

O motor estima a duração de uma fala contando palavras e sinais de pontuação. A estimativa usa como padrão 2,7 palavras por segundo, adiciona uma pausa aproximada de 0,12 s por sinal e nunca retorna menos de 0,6 s. [7]

Há duas estratégias:

| Estratégia | Comportamento |
|---|---|
| `accelerate_voice` | Mantém o vídeo no ritmo atual e eleva gradualmente a taxa da voz entre a base configurada e o máximo de 3,5x. |
| `slow_video` | Mantém a taxa base da voz sempre que possível; se a fala não couber, reduz temporariamente o `video.playbackRate`, respeitando o mínimo de 0,55x. |

No modo de aceleração, `calcularAjusteAdaptativo()` compara a duração estimada com o tempo real disponível. O modo contínuo considera também o atraso projetado da fila, a taxa anterior e o fator de duração observado da voz. A correção máxima por passo é de 0,3x, evitando mudanças bruscas. [7]

No modo de vídeo lento, o código guarda a taxa original, aplica a nova taxa e instala um listener de `ratechange`. Se o usuário alterar manualmente a velocidade, o ajuste automático é abandonado e a escolha manual passa a ter prioridade. Quando a fala termina ou falha, a taxa original é restaurada, desde que o vídeo ainda esteja conectado ao documento. [2] [7]

A voz é calibrada em execução: ao terminar uma utterance, o código compara a duração observada com a duração estimada e atualiza `fatorDuracaoVoz` com peso de 0,2, limitado entre 0,6 e 1,8. Isso tenta compensar diferenças entre vozes que pronunciam o mesmo texto em ritmos diferentes. [2]

## 5. Interfaces e mensagens

### 5.1 Pop-up de configurações

O pop-up tem 344 px de largura mínima, tema escuro, modo compacto e estados de conexão. Ele oferece seleção de idioma entre português do Brasil, inglês dos EUA e espanhol; seleção das vozes realmente expostas pelo navegador; velocidade de 0,6x a 3,5x; pitch de 0,5 a 1,5; volume de 0% a 100%; e as duas estratégias de sincronização. [8]

As alterações são persistidas globalmente e, para voz, idioma, velocidade, pitch, volume e sincronização, também em um perfil associado ao identificador extraído de `/learn/<curso>`. Ao abrir o pop-up, o perfil do curso sobrescreve os defaults e as preferências globais. O botão de restauração remove o perfil do curso atual e grava os padrões. [5]

O status é atualizado a cada segundo. Ele diferencia página incompatível, ausência de vídeo, extensão desativada, motor indisponível, erro de síntese, vídeo pausado/finalizado, frase em preparação, correção de taxa, fila atrasada e leitura normal. [5]

O botão “Testar voz” sintetiza a frase “S IA está pronta para transformar suas aulas em áudio.” diretamente no contexto do pop-up, sem passar pelo content script. O botão “Repetir última frase” envia uma mensagem para a aba ativa. “Abrir S·IA Companion” chama `chrome.sidePanel.open({ tabId })`. [5]

### 5.2 S·IA Companion

O painel lateral consulta a aba ativa a cada segundo por `SIA_GET_LEARNING_CONTEXT`. Ele exibe a última entrada como frase atual e renderiza o histórico em ordem reversa. Cada item mostra timestamp, texto, repetição, favorito e nota. A UI usa `textContent` para inserir textos, não `innerHTML`, o que reduz riscos de injeção de HTML. [9]

O replay de um item envia seu identificador ao content script. Este interrompe a fala, limpa o texto detectado, posiciona o vídeo aproximadamente 50 ms antes do início salvo e chama `video.play()`. A exportação reúne somente favoritos em Markdown, incluindo título, texto, nota, timestamp e um link para a aula. A limpeza exige confirmação e apaga o histórico da aula atual, incluindo os favoritos daquela aula. [2] [9]

### 5.3 Service worker e atalho

O manifesto registra o comando `replay-last-sentence` com sugestão `Alt+Shift+R`. O service worker consulta a aba ativa e envia `SIA_REPLAY_LAST`; se não houver content script compatível, o erro é engolido e o comando simplesmente não produz efeito. [1] [10]

### 5.4 Protocolo de mensagens

| Mensagem | Origem típica | Efeito |
|---|---|---|
| `SIA_CONFIG_UPDATE` | Pop-up → content script | Atualiza uma configuração em tempo real. |
| `SIA_GET_STATUS` | Pop-up → content script | Retorna estado do vídeo, fala, fila, taxas e erros. |
| `SIA_GET_LEARNING_CONTEXT` | Companion → content script | Retorna curso, título, URL e histórico atual. |
| `SIA_REPLAY_LAST` | Pop-up/service worker/Companion → content script | Repete a última frase ou a entrada indicada por ID. |
| `SIA_UPDATE_HISTORY_ENTRY` | Companion → content script | Atualiza favorito e/ou nota, limitada a 1.000 caracteres para a nota. |
| `SIA_CLEAR_HISTORY` | Companion → content script | Apaga o histórico da chave da aula atual. |

A comunicação é deliberadamente simples: não há canal de background para transportar legendas, nem banco de dados externo. Pop-up e painel perguntam diretamente à aba ativa; o service worker só faz a ponte do atalho. [2] [5] [9] [10]

## 6. Armazenamento e privacidade

O código usa somente `chrome.storage.local`. As chaves observadas são `sia_enabled`, `sia_voice`, `sia_lang`, `sia_speed`, `sia_pitch`, `sia_volume`, `sia_sync`, `sia_compact`, `sia_course_profiles` e chaves dinâmicas `sia_history_<pathname>`. [2] [5]

Cada entrada de histórico contém um identificador, texto, início e fim aproximados, URL completa, título da página, chave do curso, momento de criação, flag de favorito e nota. Portanto, embora o conteúdo não seja enviado para terceiros, a extensão armazena localmente tanto texto de legenda quanto URL e título da aula. A exportação de favoritos transforma esses dados em um arquivo Markdown local. [2] [9]

A política declara que não há envio de legendas, histórico, preferências ou outros dados para servidores externos, nem analytics, anúncios, compartilhamento ou venda de dados. A inspeção estática também não encontrou `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `eval`, `new Function` ou uso de cookies nos scripts executáveis. [11] [12]

As permissões são relativamente restritas: `activeTab`, `storage` e `sidePanel`. O acesso de conteúdo é declarado para `https://*.coursera.org/*`, em vez de todos os sites. [1] [3]

> A garantia de “100% local” é verdadeira para o código analisado, mas deve ser entendida como ausência de transmissão pela extensão. A fala ainda depende do mecanismo de síntese do navegador e do sistema operacional, e as URLs podem conter informações identificadoras da aula quando o usuário exporta o material.

## 7. Qualidade e testes

A suíte `tests/sync-engine.test.js` cobre 15 cenários: duração mínima; influência de pontuação; detecção de encerramento; vírgula prosódica; remoção de sobreposição; descarte de cue totalmente repetida; distribuição de frase antecipada; aumento e redução gradual de taxa; calibração de voz lenta; limite máximo de aceleração; limite mínimo de desaceleração do vídeo; e preservação da taxa manual quando não há atraso. [6]

A execução realizada durante esta análise produziu **15 testes aprovados, 0 falhas, 0 cancelamentos e 0 testes ignorados**. As verificações `node --check` também passaram para `content.js`, `sync-engine.js`, `popup.js`, `sidepanel.js` e `service-worker.js`.

O isolamento do motor em funções puras é uma boa decisão de engenharia: permite testar matemática e regras linguísticas sem simular Chrome, DOM, vídeo ou áudio. Por outro lado, a parte de maior risco operacional — sincronização real no Coursera, comportamento de `speechSynthesis`, mudança de player, storage e interação entre múltiplas abas — ainda não possui testes automatizados equivalentes. A própria documentação reconhece essa lacuna. [3] [13]

## 8. Riscos, limitações e achados técnicos

### 8.1 Dependência do Coursera e do player

A extensão depende de `<video>`, `TextTrack`, `activeCues`, `track.cues`, `playbackRate` e de uma lista de seletores CSS do player. Uma alteração estrutural no Coursera pode fazer a fonte nativa ou o fallback DOM deixarem de encontrar legendas. O uso de seletores amplos como `[class*="caption" i]` também pode gerar falsos positivos se o player passar a exibir outros textos com classes semelhantes. [2] [13]

A procura usa `document.querySelector("video")`, portanto, em uma página com múltiplos vídeos, o primeiro elemento pode não ser o vídeo da aula. Esse é um risco de robustez, ainda que provavelmente não apareça no fluxo normal do Coursera.

### 8.2 Possível perda silenciosa sob atraso intenso

O desenho mantém apenas uma `falaEnfileirada` e uma `legendaReserva`. Quando novas legendas chegam enquanto há fala e reserva ocupadas, a reserva é substituída pelo texto mais recente. Isso evita acumular atraso, mas pode descartar uma cue intermediária. É uma escolha razoável para acompanhar vídeo ao vivo, porém entra em tensão com a promessa documental de não perder silenciosamente texto. [2] [13]

A deduplicação também pode ser agressiva em casos linguísticos legítimos: se uma nova frase começa exatamente com palavras que coincidem com o final da anterior, `removerSobreposicaoInicial()` pode remover esse prefixo mesmo quando não se trata de uma repetição causada pelo player. A heurística privilegia continuidade e ausência de gagueira, não uma análise linguística completa. [7]

### 8.3 Histórico e identificação da aula

O histórico é limitado a 60 entradas por `location.pathname`, mas não existe limite global entre cursos. Depois de muitas aulas, `chrome.storage.local` e `sia_course_profiles` podem crescer indefinidamente até atingir alguma quota do navegador. A documentação já lista uma política global de retenção como pendência. [2] [3] [13]

A identificação da aula ignora query string e hash. Se duas experiências de aula usarem o mesmo caminho com parâmetros diferentes, elas podem compartilhar o mesmo histórico. O replay também usa o vídeo atualmente encontrado na aba ativa; ele não valida explicitamente se a página atual corresponde à URL salva na entrada.

### 8.4 Condições de corrida no salvamento de idioma e voz

Ao mudar o idioma, o pop-up salva simultaneamente `sia_lang` e `sia_voice` usando duas chamadas concorrentes de `saveAndSend()`. Cada chamada faz uma leitura e uma gravação independente de `sia_course_profiles`. Em uma condição de corrida, uma gravação pode sobrescrever a outra e deixar o perfil por curso com apenas uma das duas alterações. Esse ponto não é coberto pela suíte atual e merece correção com uma atualização atômica ou uma única transação lógica. [5] [6]

### 8.5 Dependência de disponibilidade de vozes

A lista de vozes é fornecida pelo navegador por `speechSynthesis.getVoices()` e pode chegar de forma assíncrona via evento `voiceschanged`. A extensão trata o caso sem vozes para o idioma selecionado, mas a experiência final varia por sistema operacional, navegador e pacotes de voz instalados. Essa limitação é estrutural da Web Speech API, não um serviço controlado pela S·IA. [5] [13]

### 8.6 Cobertura de múltiplas abas

Pop-up, painel e service worker trabalham com a aba ativa no momento da consulta. O Companion atualiza a cada segundo, mas não possui uma associação persistente com uma aba específica nem tratamento especial de troca rápida de abas. A documentação lista múltiplas abas como cenário ainda a reforçar. [3] [13]

### 8.7 Estado do pacote distribuível

O arquivo recebido contém, além do código, `.git`, um ambiente virtual `.venv` e 13 ZIPs históricos em `dist/`. Esses itens são artefatos de desenvolvimento ou versões anteriores, não componentes necessários do runtime. O script PowerShell de empacotamento usa allowlist e inclui somente 14 itens funcionais: manifesto, scripts, páginas, estilos e ícones. [14]

Foi encontrada uma divergência entre a fonte atual e `dist/sia-extension-1.7.0.zip`: o manifesto-fonte identifica o produto como `S·IA | Audio-learning by UXBRAS®`, enquanto o manifesto dentro do ZIP 1.7.0 usa `S·IA | Audio-learning da UXBRAS®`. Os scripts parecem equivalentes no conteúdo, salvo diferenças de fim de linha, mas o ZIP está nominalmente desatualizado. Antes de distribuir, é recomendável reconstruir o pacote a partir da fonte atual e executar o teste manual final previsto no checklist. [1] [14]

O checklist de publicação também registra pendências: teste manual do ZIP, e-mail oficial de suporte, política de privacidade publicada em URL HTTPS, conferência do Developer Dashboard e envio efetivo à Chrome Web Store. [14]

## 9. Avaliação final

A S·IA é um projeto coerente de extensão local para **narração sincronizada de legendas do Coursera**, com uma separação razoável entre lógica de domínio e integração com o navegador. O ponto mais forte é o motor de sincronização: ele considera duração estimada, pontuação, atraso de fila, ritmo observado da voz, limite de aceleração e desaceleração gradual do vídeo. O segundo ponto forte é o desenho local e explícito de mensagens, que mantém o escopo de dados relativamente pequeno.

O ponto mais frágil não está em uma vulnerabilidade evidente, mas na **robustez da integração**: o player do Coursera pode mudar; a lista de vozes varia; múltiplas abas podem confundir a aba ativa; o histórico pode crescer sem retenção global; a heurística de deduplicação pode remover texto legítimo; e o pipeline de fila mantém somente uma reserva. O bug mais objetivo encontrado no código é a possível condição de corrida ao salvar idioma e voz no perfil do curso.

Em uma frase: **é uma extensão Chrome de text-to-speech local, com sincronização adaptativa e ferramentas de revisão, não uma plataforma de IA em nuvem**.

## Referências

[1]: `extracted/tts-extension/manifest.json`, linhas 2–41 — Manifesto da extensão.

[2]: `extracted/tts-extension/content.js`, linhas 4–954 — Controlador de conteúdo, detecção de legendas, fala, sincronização, histórico e mensagens.

[3]: `extracted/tts-extension/README.md`, linhas 11–45, 56–156, 221–345 e 378–448 — Descrição do produto, arquitetura, privacidade, testes, roadmap e limitações.

[4]: `extracted/tts-extension/sync-engine.js`, linhas 12–176 — Motor de duração, deduplicação e sincronização adaptativa.

[5]: `extracted/tts-extension/popup.js`, linhas 4–381 — Configurações, perfis, status, vozes e comunicação com a aba.

[6]: `extracted/tts-extension/tests/sync-engine.test.js`, linhas 15–172 — Suíte automatizada do motor.

[7]: `extracted/tts-extension/sync-engine.js`, linhas 12–166 — Fórmulas de duração, taxas e limites.

[8]: `extracted/tts-extension/popup.html` e `popup.css` — Controles e apresentação do pop-up.

[9]: `extracted/tts-extension/sidepanel.html`, `sidepanel.js` e `sidepanel.css` — S·IA Companion e histórico de aprendizagem.

[10]: `extracted/tts-extension/service-worker.js`, linhas 3–17 — Encaminhamento do atalho de replay.

[11]: Varredura estática dos scripts executáveis (`content.js`, `popup.js`, `sidepanel.js`, `service-worker.js` e `sync-engine.js`) — ausência de chamadas de rede e execução dinâmica observadas.

[12]: `extracted/tts-extension/PRIVACY.md`, linhas 10–37 — Dados processados, armazenamento, transmissão e permissões declaradas.

[13]: `extracted/tts-extension/RELATORIO_TECNICO_SIA.md`, linhas 402–433 e 695–709 — Arquitetura e limitações reconhecidas.

[14]: `extracted/tts-extension/scripts/package-extension.ps1` e `RELEASE_CHECKLIST.md` — Allowlist de empacotamento e pendências de publicação.
