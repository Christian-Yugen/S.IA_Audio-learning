# Correção CSP — S·IA 1.8.3

## Causa

O erro exibido pelo Chrome foi:

```text
WebAssembly.instantiateStreaming(): Compiling or instantiating WebAssembly module violates Content Security Policy because neither wasm-eval nor unsafe-eval is an allowed source of script in script-src 'self'.
```

A origem informada foi `popup.html`, porque a versão anterior carregava `neural-tts/piper-bridge.js` diretamente no popup. O bridge inicializa o Worker e o bundle Emscripten; isso fazia o popup tentar compilar WASM dentro do contexto de extensão bloqueado pela CSP do Manifest V3.

## Correção

A 1.8.3 remove o bridge do `popup.html`. O popup agora contém apenas `popup.js` e não carrega WASM. O `piper-bridge.js` continua sendo carregado somente como content script na página do Coursera, onde cria o Worker e usa os assets locais.

O botão **Testar voz** envia duas mensagens à aba ativa:

```text
SIA_PRIME_NEURAL_AUDIO → prepara o AudioContext no content script
SIA_TEST_NEURAL_VOICE  → gera e reproduz a frase no Worker da página
```

O content script responde de forma assíncrona e o botão mostra a mensagem de erro quando a aba não responde, quando o áudio está bloqueado ou quando o Worker falha.

A reprodução também passou a validar estado `running`, samples não vazios e taxa de áudio válida. O bridge tenta a taxa do Piper e recua para a taxa padrão do dispositivo se necessário. O callback `onstart` ocorre somente depois de `source.start()` ser aceito.

## Segunda correção: contexto invalidado após recarregar a extensão

O erro posterior exibido pelo Chrome foi:

```text
Uncaught (in promise) Error: Extension context invalidated
```

A linha indicada salvava o histórico com `await chrome.storage.local.set(...)`. Esse erro não indica, por si só, uma falha do modelo Piper: indica que a aba do Coursera ainda mantinha um content script de uma versão anterior, enquanto a extensão já havia sido recarregada, alternada ou atualizada. O contexto antigo perde acesso às APIs da extensão; portanto, uma operação pendente de armazenamento rejeita a Promise.

A 1.8.3 agora trata esse salvamento de forma segura e informa no console que a aba deve ser reaberta, sem gerar uma rejeição não tratada. O popup também diferencia **preferência salva** de **configuração aplicada**. Se a aba não responder, ele informa `reabra a aba do Coursera para aplicar a versão atual da extensão`.

O teste neural deixou de confirmar sucesso apenas ao enfileirar a fala. Agora ele só mostra sucesso quando o callback `onstart` é disparado depois que o áudio Piper foi realmente iniciado. Se a geração falhar, exceder o tempo ou recuar para a voz nativa, o popup informa a falha em vez de aparentar que o Piper foi usado.

## Atualização

Remova a 1.8.2 antiga, descompacte `sia-extension-1.8.3-piper-csp-fix.zip` em uma pasta nova e carregue essa pasta em `chrome://extensions` com **Carregar sem compactação**. Feche e reabra a aba do Coursera antes do teste.

O popup correto deve mostrar `v1.8.3 · neural experimental`. Se a versão 1.8.3 não aparecer, o Chrome ainda está apontando para uma pasta antiga.

## Validação

A versão corrigida passa pelos **20 testes automatizados** do motor de sincronização e do bridge, checagem sintática e validação estrutural: `popup.html` não referencia mais `piper-bridge.js`, enquanto `manifest.json` mantém o bridge no content script. Também foram verificadas as mensagens `SIA_CONFIG_UPDATE`, `SIA_PRIME_NEURAL_AUDIO` e `SIA_TEST_NEURAL_VOICE`, além do retorno efetivo do engine aplicado.
