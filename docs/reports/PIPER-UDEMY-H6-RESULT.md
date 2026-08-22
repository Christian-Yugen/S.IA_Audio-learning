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
