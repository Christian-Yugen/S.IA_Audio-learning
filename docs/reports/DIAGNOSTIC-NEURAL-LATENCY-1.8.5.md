# S·IA 1.8.5 — Correção do atraso inicial neural

## Diagnóstico

A comparação entre o baseline 1.7.0 e o código 1.8.4 mostrou que o arquivo `sync-engine.js` permaneceu byte a byte idêntico. O intervalo de monitoramento das legendas também permaneceu em 75 ms, e as cues provenientes de `TextTrack.activeCues` continuam sendo encaminhadas no mesmo ciclo de detecção. Portanto, o atraso percebido não foi introduzido pelo cálculo de velocidade da voz nativa.

A diferença está no caminho de execução. A Web Speech API aceita `speechSynthesis.speak()` e o Chrome administra a fila de áudio. O Piper, por ser uma síntese offline, precisa produzir todos os samples antes que `AudioBufferSourceNode.start()` possa ser chamado. Na arquitetura 1.8.4, isso atravessava o content script, o service worker, o documento offscreen, o Worker e o runtime WASM.

O teste real mediu aproximadamente 402–603 ms para frases curtas depois que o host estava pronto. Quando uma frase neural terminava, a frase seguinte ainda podia precisar iniciar uma nova geração, porque a geração futura não estava sendo antecipada de forma consistente.

## Correções aplicadas na 1.8.5

A versão 1.8.5 mantém o caminho nativo intacto e acrescenta três mecanismos somente ao caminho `piper-local`.

Primeiro, o Worker e o runtime neural são aquecidos assim que o usuário seleciona o Piper. O aquecimento não gera uma frase audível nem coloca áudio descartável na fila; ele apenas inicializa o host offscreen e deixa o runtime pronto.

Segundo, cada nova fala neural inicia a síntese assim que a legenda é detectada. A fila usa deduplicação de requisições em andamento e reutiliza o resultado do cache, evitando que a mesma frase seja sintetizada duas vezes.

Terceiro, quando uma cue TextTrack termina, a próxima cue é identificada e pré-sintetizada enquanto a fala atual ainda está tocando. A taxa prevista usa a previsão atualizada da fila para que o cache corresponda à taxa usada quando a próxima frase efetivamente começar.

| Caminho | 1.7.0/1.8.4 | 1.8.5 |
|---|---|---|
| Voz do navegador | Mantido | Mantido sem alteração funcional |
| Detecção de legendas | Monitor de 75 ms | Mantida |
| Motor neural | Geração sob demanda | Worker aquecido + pré-síntese da próxima cue |
| Duplicação de geração | Possível em pedidos concorrentes | Deduplicada por texto/taxa |
| Fallback nativo | Mantido | Mantido |

## Validação

Foram aprovados os 20 testes automatizados existentes: 15 testes do motor de sincronização e 5 testes do bridge neural. Também foram aprovadas as checagens de sintaxe de `content.js`, `neural-tts/piper-bridge.js`, `neural-tts/piper-worker.js`, `offscreen.js` e `service-worker.js`.

A reprodução foi feita em Chromium real com a extensão carregada, documento offscreen, Worker, WASM e modelo Piper locais. O teste neural continuou retornando `started: true`, com `engine: piper-local`, e a reversão para `browser` continuou disponível.

Em uma instância fria, o primeiro teste imediato mediu aproximadamente 2,05 s, porque a seleção do Piper e a primeira geração ocorreram simultaneamente enquanto o Worker/runtime ainda aquecia. Depois que o host estava pronto, duas frases novas mediram aproximadamente 0,56–0,61 s no Chromium real. Uma repetição posterior das mesmas frases retornou aproximadamente 0,5 ms por causa do cache de áudio; esse valor não representa uma nova síntese e não deve ser usado como expectativa geral.

O aquecimento antecipado reduz a probabilidade de o primeiro áudio disputar a inicialização do runtime, mas o tempo exato ainda depende de quando o usuário seleciona o Piper, da CPU e do tamanho da legenda. A melhoria principal e mais determinística é a pré-síntese da próxima cue durante a fala atual.

O teste de sequência de cues confirmou que a segunda frase passou a ser preparada durante a reprodução da primeira, em vez de aguardar o fim da primeira para começar a geração. O tempo exato percebido no Chrome normal ainda pode variar conforme CPU, carga da página e tamanho da legenda.

## Preservação

O `sync-engine.js` não foi alterado. A função nativa `enfileirarFala()` continua chamando `speechSynthesis.speak()` pelo mesmo caminho. A alteração de status que expõe `currentSpeechText` e `queuedSpeechText` é apenas diagnóstica e não participa do cálculo de sincronização.

## Instalação

Use somente o pacote `sia-extension-1.8.5-neural-sync-fix.zip`. Remova versões anteriores, carregue a pasta descompactada em `chrome://extensions`, feche as abas antigas do Coursera e abra uma nova. Selecione o Piper antes de iniciar a aula para permitir que o Worker seja aquecido. O rodapé deverá exibir `v1.8.5 · neural sync fix`.
