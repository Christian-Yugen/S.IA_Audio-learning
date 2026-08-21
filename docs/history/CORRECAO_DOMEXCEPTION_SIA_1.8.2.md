# Correção da DOMException — S·IA 1.8.2

## Diagnóstico

O rastreamento indicou que o Piper já havia chegado ao `processQueue`, mas uma operação do caminho de reprodução PCM lançou `DOMException`. O bridge então executou o fallback para `speechSynthesis`, comportamento correto para não interromper a aula.

A versão anterior não preparava de maneira confiável o `AudioContext` no gesto do usuário do botão **Testar voz** e não distinguia claramente falha de contexto, buffer, samples, taxa de áudio ou `source.start()`.

## Correções

A 1.8.2 cria ou retoma o `AudioContext` no clique do botão, tenta 22.050 Hz e recua para a taxa padrão do dispositivo se necessário. O content script também recebe `SIA_PRIME_NEURAL_AUDIO`, e gestos na página tentam liberar a instância usada pela leitura contínua.

O bridge agora valida que o contexto está `running`, rejeita samples vazios, valida taxa entre 8.000 e 96.000 Hz e informa o nome/tipo da exceção. O pop-up mostra o resultado do teste em vez de falhar silenciosamente.

## Validação

A versão corrigida passou por 20 testes automatizados, checagem sintática, validação do manifesto, extração do ZIP e teste browser real do bridge. O harness completou:

```text
primeAudio: ok=true, state=running, sampleRate=22050
start
end
```

Os hashes de `sync-engine.js`, `dom-fallback.js`, `sidepanel.js`, `service-worker.js` e dos testes originais continuam iguais ao baseline.

## Atualização no Chrome

1. Remova ou desative a versão 1.7.0.
2. Em `chrome://extensions`, remova a versão experimental antiga 1.8.0/1.8.1.
3. Descompacte `sia-extension-1.8.2-piper-domexception-fix.zip` em uma pasta nova.
4. Clique em **Carregar sem compactação** e selecione a pasta que contém diretamente `manifest.json`.
5. Feche a aba do Coursera e abra-a novamente; uma recarga simples pode manter scripts antigos.
6. Abra o pop-up da versão 1.8.2, confirme o rodapé `v1.8.2 · neural experimental`, escolha **Voz neural local PT-BR — experimental** e clique em **Testar voz**.

A primeira geração pode levar alguns segundos enquanto o WASM e o modelo são inicializados. Se a voz nativa continuar funcionando e a neural falhar, o console deve agora apresentar uma mensagem mais específica.

## Limite da validação

O teste no Coursera real depende da sessão, do dispositivo e das políticas de áudio do Chrome do usuário. O runtime e o bridge foram validados no navegador local, mas a confirmação final deve ser feita na aula real após instalar a 1.8.2.
