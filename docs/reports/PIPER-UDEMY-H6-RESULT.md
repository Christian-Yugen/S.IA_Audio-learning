# Gate H6 — Piper PT-BR compartilhado na Udemy

## Objetivo

O Gate H6 habilita o mesmo `neural-tts/piper-bridge.js` usado pelo Coursera também no bloco Udemy. O adaptador Udemy continua sem qualquer chamada direta a `speechSynthesis`, `AudioContext`, Piper ou fila própria. Ele somente normaliza a cue e a entrega ao `SiaCaptionInput`; o content script compartilhado escolhe Piper ou voz nativa conforme a configuração.

## Correções

A versão do manifesto foi incrementada para **1.8.8**. O bloco Udemy agora carrega `neural-tts/piper-bridge.js`, e os recursos locais do worker/runtime Piper foram liberados também para `https://www.udemy.com/*`. Cues TextTrack temporais, com confiança alta e `safeToSpeak: true`, usam Piper quando o motor está ativo. Se o Piper falhar na inicialização, geração ou reprodução, o bridge desativa o motor, salva o fallback browser e a mesma fila comum tenta a voz nativa.

O caminho DOM/transcrição permanece fail-closed. Texto visual sem `startTime` e `endTime` não alcança nenhum motor de voz. A seleção de Piper no popup deixa de ser enganosa porque o bridge passa a estar presente no bloco Udemy; o estado real continua exposto por `SiaPiperVoiceStatus`.

Também foi corrigida a inicialização do host Udemy para sincronizar imediatamente o estado real `paused/ended` do vídeo ao conectar o player. Isso evita que as primeiras cues sejam rejeitadas quando a extensão entra depois que o vídeo já começou.

## Validação

| Suíte | Resultado |
|---|---:|
| Testes Coursera | 20/20 aprovados |
| Testes plataforma e hook H0–H6 | 25/25 aprovados |
| Testes do adaptador Udemy | 13/13 aprovados |
| Sintaxe JavaScript | Aprovada |
| Manifesto H6 | Piper presente no bloco Udemy e recursos liberados |
| `sync-engine.js` | Hash protegido preservado |
| Fixture segura | TextTrack temporal aceita; apenas caminho de voz comum é acionado |
| Fixture insegura | DOM sem timing permanece sem evento de fala |

## Evidência do navegador real

Na aula Udemy aberta durante o diagnóstico, o player exibiu `0:00 / 0:00` e `Carregado: NaN%`, enquanto o painel de transcrição carregou. O menu do player indicou `Legendas Desligado`. Isso demonstra que transcrição visível não é prova de uma cue TextTrack temporal ativa. A S·IA permanece silenciosa nesse caso por segurança; para leitura automática, é necessário ativar as legendas do player e haver uma faixa TextTrack com timing.

## Limitação do teste headless

A fixture Chromium confirmou os estados de segurança e a seleção do caminho, mas a saída física de áudio não é mensurável no Chromium headless. O teste físico no Chrome normal é necessário para confirmar o som neural no dispositivo do usuário, após o carregamento da versão 1.8.8.

## Correção posterior da leitura automática

A reprodução física confirmou que os testes isolados de voz estavam funcionando, mas o player real não acionava a leitura automática de forma confiável. A causa encontrada foi a dependência excessiva do polling e dos eventos gerais do vídeo para perceber a troca de cue. O adaptador agora registra listeners `cuechange` nas faixas TextTrack e agenda uma nova leitura imediatamente quando a faixa muda. O polling de um segundo permanece como fallback para players que não emitem `cuechange` de modo consistente.

As cópias-fonte experimental e empacotada foram sincronizadas, e o teste determinístico `cuechange de TextTrack dispara nova leitura imediata` foi adicionado. O estado DOM/transcrição sem timing continua sem qualquer evento de fala.

## Correção complementar do fluxo automático

A análise do player real mostrou que a Udemy/Shaka pode manter a faixa escolhida como `Português` no menu, mas com `TextTrack.mode = "disabled"`, e também pode substituir o elemento `<video>` mantendo o mesmo `id` e o mesmo container. O adaptador agora prepara somente a faixa de legenda selecionada em modo `hidden`, respeita o idioma selecionado e reanexa listeners quando o objeto `<video>` muda mesmo que sua identidade textual permaneça igual.

Uma cue só é emitida ao hook quando o vídeo está em reprodução e o relógio atual está dentro da janela temporal da cue. Assim, a cue não é deduplicada prematuramente enquanto o player ainda está pausado ou carregando. O fallback DOM/transcrição permanece `UNSAFE_TO_SPEAK` e não alcança qualquer motor de voz.

## Adendo final — Gate H7 Shaka temporal (1.8.12)

Em 22 de agosto de 2026, o Gate H7 foi corrigido e validado na fixture Chromium da Udemy. A causa raiz encontrada foi dupla. Primeiro, o bridge no mundo `MAIN` emitia uma cue temporal sem o campo obrigatório `adapterVersion`; por isso, o contrato H0–H4 a rejeitava como `invalid-cue`, e o retry não era aplicável. Segundo, o primeiro evento podia ocorrer antes de o host isolado registrar seu listener, enquanto a deduplicação do bridge impedia uma nova emissão.

A correção adiciona `adapterVersion: "udemy-v0-experimental"` ao payload H7, substitui a fronteira `CustomEvent` por `window.postMessage`, introduz um handshake `SIA_SHAKA_CAPTION_BRIDGE_READY` e faz o bridge retransmitir a última cue válida quando o host fica pronto. O host também informa `state: "PRIMARY_READY"` quando `SiaCaptionInput` aceita a cue. A emissão diagnóstica do caminho comum passou a reconhecer o gate `H7-shaka-temporal-caption`; nenhuma fila, sincronização, chamada Piper ou `speechSynthesis` foi duplicada no adaptador Udemy.

A validação segura mostrou `source: "shaka-caption"`, `confidence: "high"`, `state: "PRIMARY_READY"`, `safeToSpeak: true` e duas requisições no painel H5 da fixture. O modo `?unsafe`, que contém apenas texto DOM sem timing, permaneceu em `source: "dom-caption"`, `state: "UNSAFE_TO_SPEAK"`, `safeToSpeak: false` e sem evento H5. Os erros de início de voz observados no Chromium headless pertencem à indisponibilidade da síntese Web Speech nesse ambiente sem interface; a validação do Gate H7 confirma a entrega correta da cue ao núcleo comum, não constitui teste acústico físico.

A regressão final aprovou 30 testes do caminho plataforma/H0–H7, 18 testes do adaptador Udemy e 3 testes específicos do bridge H7. A sintaxe dos arquivos alterados, `git diff --check` e o hash protegido de `extension/sync-engine.js` também foram aprovados; o hash permaneceu `8c2e9ad28c1c570e44d4c3c42148ada403dec696864b21675aedd2d6d9bef00a`. O release físico correspondente é o pacote `sia-extension-1.8.12-h7-shaka-temporal.zip`.

> Regra preservada: texto DOM sem `startTime`/`endTime` confirmados nunca alcança a fala; somente cues temporais válidas, de alta confiança, associadas ao player ativo e com vídeo em reprodução podem entrar no núcleo de áudio compartilhado.


## Adendo 1.8.13 — coexistência de abas Coursera e Udemy

A análise do problema relatado ao abrir simultaneamente cursos Coursera e Udemy encontrou uma colisão no host offscreen compartilhado. Cada documento iniciava seu contador de requisições Piper em `1`, enquanto o offscreen mantinha um `Map` global indexado somente por `requestId`. A requisição `1` de uma aba podia substituir a requisição `1` de outra, fazendo uma resposta neural chegar ao contexto errado ou expirar.

A correção mantém um único Worker Piper e acrescenta isolamento lógico por `sessionId`: as chaves pendentes agora são compostas por `sessionId + requestId`, e o Worker devolve o mesmo identificador em resultados e erros. O comando `dispose` também passou a ser limitado à sessão que o solicitou; o Worker compartilhado só é encerrado quando a última aba neural é descartada. Uma falha ou fechamento de uma aba não cancela nem destrói a sessão de outra.

A propagação automática de `sia_voice_engine` por `chrome.storage.onChanged` foi removida do bridge. O valor salvo continua servindo como padrão na inicialização, enquanto a alteração em tempo real é encaminhada pelo popup diretamente à aba ativa e ao perfil do curso. Isso impede que escolher voz nativa ou neural em uma aba reconfigure silenciosamente as demais abas já abertas. O roteamento Coursera/Udemy continua automático pelos padrões de URL do Manifest V3; não é necessário selecionar manualmente a plataforma.

Foram adicionados testes de concorrência com duas sessões reutilizando o mesmo `requestId`, teste de descarte isolado e regressão que impede a volta da propagação global do motor. O `sync-engine.js` permaneceu intocado, Coursera e Udemy continuam usando o mesmo núcleo de voz e nenhuma fila paralela foi criada.
