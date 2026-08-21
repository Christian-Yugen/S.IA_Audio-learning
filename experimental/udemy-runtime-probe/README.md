# S·IA Udemy Runtime Probe

Este é um probe temporário e isolado para a Fase 2 do plano de expansão da S·IA. Ele observa passivamente o player, o elemento `<video>`, `TextTrack`, marcadores de legenda/transcrição, mutações e eventos de mídia em uma aula Udemy autorizada.

O probe **não é a extensão S·IA oficial**. Ele não contém Piper, `speechSynthesis`, `sync-engine.js`, fila de áudio ou lógica de sincronização. Também não chama endpoints próprios de rede.

## Uso controlado

Carregue a pasta desta área por **Carregar sem compactação** em `chrome://extensions` somente durante um teste autorizado. Depois abra uma aula Udemy compatível e observe o painel temporário no canto inferior direito. Não é necessário alterar velocidade, trocar idioma ou usar controles do player para o probe funcionar.

O popup mostra o último relatório mantido somente em `chrome.storage.session`. O relatório reduz texto a comprimento, número de palavras e hash; texto bruto de aula não deve ser copiado para o repositório.

## Segurança de escopo

O probe não deve ser usado em páginas fora de `www.udemy.com/course/*/learn/lecture/*`. Ele não deve ser usado para capturar credenciais, cookies, tokens, conteúdo protegido ou dados de outros usuários. Ao concluir o teste, desative e remova a extensão temporária.

## Fixture local

`fixtures/fixture-runner.html` fornece um ambiente determinístico para validar a lógica do probe com uma track WebVTT e marcadores DOM. A fixture não representa um contrato da Udemy; ela serve apenas para verificar que o probe consegue distinguir uma `TextTrack` materializada de uma superfície DOM.

## Status

O probe foi validado por sintaxe e isolamento. A implementação de produção do adaptador Udemy continua bloqueada até o relatório da Fase 2, a regressão Coursera e uma nova aprovação explícita.
