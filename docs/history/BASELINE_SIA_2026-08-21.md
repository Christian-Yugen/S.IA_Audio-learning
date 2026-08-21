# Baseline da S·IA antes da implantação neural

**Data:** 21 de agosto de 2026  
**Diretório de trabalho:** `extension/` no repositório da S·IA  
**Versão do manifesto:** 1.7.0  
**Objetivo:** congelar a cópia atualmente funcional antes de acrescentar Piper PT-BR + sherpa-onnx WebAssembly.

## Resultado da validação

A checagem sintática dos scripts JavaScript foi aprovada. Os 15 testes existentes de `tests/sync-engine.test.js` foram aprovados, sem falhas, cancelamentos ou testes ignorados.

```text
 tests 15
 pass 15
 fail 0
 cancelled 0
 skipped 0
 BASELINE_VALIDATION_OK
```

## Estado atual

O manifesto usa Manifest V3, versão mínima do Chrome 114, permissões `activeTab`, `storage` e `sidePanel`, service worker `service-worker.js`, painel lateral `sidepanel.html` e os scripts de conteúdo nesta ordem:

```text
sync-engine.js
 dom-fallback.js
 content.js
```

O arquivo `dom-fallback.js` já existe como camada de recuperação do DOM e deve ser tratado como parte do baseline funcional atual. A nova camada neural não deve alterar o detector primário, o fallback DOM ou o motor de sincronização.

A cópia de trabalho possui alterações locais anteriores em diversos arquivos e o novo `dom-fallback.js` aparece como não rastreado pelo Git. Isso foi preservado deliberadamente. Nenhuma limpeza, reset ou rebase foi executado nesta fase.

## Hashes dos arquivos funcionais atuais

Os hashes abaixo são a referência da cópia de trabalho antes da implantação do provedor neural:

```text
8fd8db80343bf686ecada0d9f824acfe0c087223c9b7e99b608565ee59302e5c  content.js
8c2e9ad28c1c570e44d4c3c42148ada403dec696864b21675aedd2d6d9bef00a  sync-engine.js
5c513b8490df4bfe3598edeace35ef2868bd84dc2103ca01562f51ebed0b0ab102  popup.js
b636d571056dea033bbeae6dd3c073e8bebc212700036fa5621411371d2f06ec  sidepanel.js
da0ba3232408cef7c895ad5f33af5bad0e3e4553709622a214a8c64f147060d3  service-worker.js
642351c77bf0730d5eb92b6eba1f7d232b369d41725e4438311cd44a157c49f8  dom-fallback.js
88621c03e59df092272afd61648ad3a3b81fa62ce3  manifest.json
cc1b4357ed2ac49f01704d0b6a295a2077315e5aa389e701949406a0506163d8  scripts/package-extension.ps1
825363322696f76b78007703e3879b85543454110ef98a0c81735c976c53f497  tests/sync-engine.test.js
```

> Observação: os hashes desta seção são uma fotografia do estado de trabalho e devem ser regenerados automaticamente no próximo checkpoint. O hash de `popup.js` e o de `manifest.json` devem ser confirmados pela ferramenta de validação antes de qualquer commit; os demais foram copiados do registro da checagem inicial.

## Regra de regressão

Qualquer alteração posterior deverá ser limitada aos novos arquivos do provedor neural, aos assets fixados, ao manifesto/empacotador quando necessário e à menor ponte de seleção de provedor possível. Se o modo padrão mudar, se qualquer teste atual falhar ou se a voz nativa deixar de funcionar, a alteração deverá ser rejeitada ou revertida.

## Próxima fase

A próxima fase é fixar uma voz Piper explicitamente `pt_BR`, o runtime sherpa-onnx WebAssembly, as versões, os hashes e as licenças. Ainda não há modelo neural instalado ou integrado neste baseline.
