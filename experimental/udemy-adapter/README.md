# Adaptador Udemy experimental

Este diretório contém a primeira implementação executável do contrato Udemy, mantida fora de `extension/` e fora do caminho Coursera.

## O que está implementado

O módulo reconhece URLs de aulas Udemy, localiza o elemento de vídeo, acompanha a identidade do contêiner Shaka, tenta ler uma cue temporal de `TextTrack`, observa uma legenda DOM como fallback de diagnóstico, normaliza estados e diagnósticos e remove listeners quando o player é substituído ou destruído.

A fonte DOM/transcrição permanece com confiança baixa e estado `UNSAFE_TO_SPEAK`. Ela nunca produz `CAPTION_CHANGED` seguro. Somente uma cue com texto, tempos finitos, fonte reconhecida e confiança alta recebe `safeToSpeak: true`.

## O que não está implementado

Não há chamada a `speechSynthesis`, Piper, `AudioContext`, fila, sincronização, `sync-engine.js`, content script oficial ou alteração da velocidade do vídeo. O adaptador não está conectado ao núcleo S·IA.

## Testes

No diretório deste pacote experimental:

```bash
node --test test/*.test.js
```

Os testes cobrem URL, normalização de cue, bloqueio de texto sem tempo, diagnóstico, deduplicação, `TextTrack`, fallback DOM, troca de player e destruição do ciclo de vida.

## Gate

Este código é uma prova de contrato. Mesmo com os testes aprovados, a integração com o núcleo de áudio, o manifesto ou a extensão oficial exige revisão e aprovação separadas.
