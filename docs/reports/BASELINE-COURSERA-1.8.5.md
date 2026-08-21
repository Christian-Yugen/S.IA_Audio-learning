# Baseline protegido do Coursera — S·IA 1.8.5

**Data do congelamento:** 21 de agosto de 2026  
**Escopo:** Fase 0 do plano Udemy  
**Status:** congelamento técnico; não representa uma nova release  
**Plataforma protegida:** Coursera  
**Versão de referência:** 1.8.5

## Objetivo

Este registro congela o estado funcional que deverá ser preservado durante qualquer investigação ou expansão futura. A Fase 0 não implementa o adaptador Udemy e não autoriza alteração no núcleo de áudio, no sincronizador, no manifesto ou no caminho funcional do Coursera.

## Estado confirmado

| Item | Estado esperado |
|---|---|
| Manifest V3 | Presente |
| Versão do manifesto | 1.8.5 |
| Nome da versão | `1.8.5 · Piper PT-BR neural sync fix` |
| Permissão `offscreen` | Presente |
| CSP com `wasm-unsafe-eval` | Presente |
| Host `offscreen.html/js` | Presente |
| Worker Piper fora do content script | Preservado |
| Voz nativa | Padrão e preservada |
| Piper PT-BR | Opcional e experimental |
| Fallback neural → navegador | Preservado |
| Fallback DOM de legenda | Presente |
| Núcleo de sincronização | Protegido |

## Hashes congelados

Os arquivos abaixo foram comparados entre o diretório funcional original e a cópia organizada do repositório. Os hashes coincidem.

| Componente | SHA-256 |
|---|---|
| `sync-engine.js` | `8c2e9ad28c1c570e44d4c3c42148ada403dec696864b21675aedd2d6d9bef00a` |
| `content.js` | `27b351ec2cbe6fbb172d5772cbbdd0eb54477e16713d826a185e56bec5b69f8b` |
| `neural-tts/piper-bridge.js` | `f425ac72bb4d962e12f8e31162b17800a34710850692d057181855bb97624939` |
| `offscreen.js` | `706ccaf32551af98b98dc24336a433ae712971615a9dd4084e36c0bfc1433503` |
| `service-worker.js` | `6e3231ff62031f2bdec02d5620b5b09d8c8330bf4d63a3c5efd23a78344798de` |

## Arquivos obrigatórios

O conjunto distribuível contém manifesto, content script, núcleo de sincronização, fallback DOM, popup, side panel, service worker, host offscreen, controlador offscreen, bridge Piper, Worker Piper, runtime WebAssembly, modelo neural e ícones.

A cópia de referência foi mantida no diretório `extension/` do repositório organizado. O diretório funcional original não foi alterado durante este congelamento.

## Invariantes para as próximas fases

Nenhum adaptador Udemy poderá importar ou duplicar a fila de áudio. Nenhuma hipótese sobre a Udemy poderá justificar alteração no Coursera. O `sync-engine.js` deverá manter o hash acima, salvo exceção formal aprovada antes da alteração. Toda fonte alternativa de legenda deverá ser visível no diagnóstico e toda baixa confiança deverá suspender a fala.

## Resultado da Fase 0

Este documento será complementado pelos resultados da regressão automatizada e da comparação com a release publicada. A Fase 0 somente será considerada concluída após esses dois registros e após a confirmação de que o baseline continua reproduzível.


## Regressão automatizada

A suíte foi executada no diretório funcional original e na cópia organizada do repositório. Ambos produziram o mesmo resultado:

| Métrica | Resultado |
|---|---:|
| Testes executados | 20 |
| Aprovados | 20 |
| Falhas | 0 |
| Cancelados | 0 |
| Ignorados | 0 |

A verificação de sintaxe JavaScript passou para content script, fallback DOM, bridge Piper, Worker Piper, offscreen, service worker, side panel, popup e sincronizador.

## Invariantes arquiteturais

Foram confirmados nos dois diretórios a permissão `offscreen`, a CSP com `wasm-unsafe-eval`, a presença de `offscreen.html` e `offscreen.js`, a ausência de `piper-bridge.js` no popup e a execução do Worker neural no host offscreen.

## Comparação de release e repositório

O pacote `sia-extension-1.8.5-neural-sync-fix.zip` contém o manifesto 1.8.5, `offscreen.html`, `offscreen.js` e o Worker Piper. Os hashes dos componentes protegidos coincidem entre o diretório funcional original e a cópia organizada.

A `main` remota do repositório `Christian-Yugen/S.IA_Audio-learning` também contém o manifesto 1.8.5. O hash remoto do `extension/sync-engine.js` é `8c2e9ad28c1c570e44d4c3c42148ada403dec696864b21675aedd2d6d9bef00a`, e o hash remoto do `extension/content.js` é `27b351ec2cbe6fbb172d5772cbbdd0eb54477e16713d826a185e56bec5b69f8b`, iguais aos hashes congelados.

## Conclusão da Fase 0

O baseline Coursera 1.8.5 está congelado, reproduzível e coerente entre código funcional, cópia organizada, pacote distribuível e `main` remota. Nenhum código foi alterado nesta fase. A Fase 0 está concluída.

A investigação passiva da Udemy continua bloqueada até autorização explícita da Fase 1.
