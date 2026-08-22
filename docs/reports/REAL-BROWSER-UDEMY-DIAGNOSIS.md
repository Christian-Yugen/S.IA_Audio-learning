# Diagnóstico no navegador real — Udemy

**Data:** 22 de agosto de 2026
**URL:** `https://www.udemy.com/course/complete-ai-guide/learn/lecture/48416219?start=0#overview`

## Evidências observadas

A aula foi aberta na sessão conectada e o player real foi encontrado como `shaka-video-container-62643659`. O controle exibiu `0:00 / 0:00` e `Carregado: NaN%`, embora o conteúdo da aula e o painel de transcrição tenham carregado.

O player foi acionado diretamente. O controle mudou de `Play` para `Pause`, portanto a ação de reprodução foi aceita pela interface, mas o indicador permaneceu em `0:00 / 0:00` e `Carregado: NaN%`. Isso sugere que a mídia do player não forneceu metadados/duração nesta sessão, independentemente da extensão.

O painel de **Transcrição** foi aberto e mostrou texto da aula em português automático. A lista do player indicou `Legendas Desligado`, ou seja, durante essa observação as legendas TextTrack não estavam habilitadas no player. O texto visível no painel de transcrição não é equivalente, por si só, a uma cue TextTrack temporal.

## Hipóteses priorizadas

| Evidência | Consequência provável |
|---|---|
| `0:00 / 0:00` e `Carregado: NaN%` | A mídia não iniciou metadata suficiente para testar sincronização ou cue temporal nessa sessão |
| Transcrição disponível | A transcrição pode carregar mesmo quando a faixa TextTrack não está ativa |
| Legendas indicadas como desligadas | O adaptador fail-closed não deve falar esse conteúdo sem `startTime`, `endTime`, confiança alta e `safeToSpeak: true` |
| Voz nativa do botão funciona | A API nativa na aba está disponível; o problema neural é separado |

## Limites do diagnóstico

Não foi possível abrir a página interna `chrome://extensions` pela ponte de inspeção da sessão, nem coletar diretamente o painel do popup por essa interface. A correção foi rastreada no código e validada no harness: o popup agora envia o teste nativo para a aba ativa; o Piper segue uma rota distinta que ainda precisa de diagnóstico próprio no navegador real.

## Nova observação após tentativas de reprodução

Após alternar o painel de transcrição e iniciar o player, o controle continuou exibindo `0:00 / 0:00` e `Carregado: NaN%`. O menu de legendas continuou apresentando `Legendas Desligado`. A transcrição é carregada em um painel separado, mas isso não prova que `video.textTracks[...].activeCues` esteja disponível.

A consequência para o H5 é objetiva: sem legenda TextTrack temporal ativa, `udemy-adapter.js` não emite `SIA_CAPTION_CHANGED` segura; o hook mantém `safeToSpeak: false` e a extensão não deve falar. Isso é o comportamento fail-closed previsto, não uma autorização para ler texto de transcrição sem timing.

## Descoberta adicional do código

O manifesto 1.8.7 carrega `neural-tts/piper-bridge.js` apenas no bloco Coursera. O bloco Udemy carrega o hook, content script e adaptador, mas não o bridge Piper. Portanto, o botão neural no popup pode ser selecionado globalmente, porém no contexto Udemy o handler retorna `bridge neural não carregado` ou `piper-inactive`. O H5 aprovado é deliberadamente nativo e `nativeOnly`; Piper Udemy ainda exige uma etapa H6 explicitamente autorizada.

## Verificação adicional do controle de legendas

Na sessão conectada, o botão correto de `Legendas` abriu a lista de faixas e mostrou `Desligado` como estado atual, com duas opções `Português [Automático]` disponíveis. O painel `Transcrição` é um controle separado. O player ainda mostrava `0:00 / 0:00` e `Carregado: NaN%`.

## Segunda aula Udemy verificada

Também foi aberta a aula `six-sigma-green-belt-with-minitab/learn/lecture/13014304`. O player Shaka foi encontrado e o controle `Legendas` ofereceu `Português`, porém o estado observado permaneceu `Desligado`. Em ambas as aulas da sessão, o player exibiu `0:00 / 0:00` e `Carregado: NaN%`, portanto esta sessão não forneceu duração/relógio de mídia válido para uma reprodução automática verificável.

## Evidência do HTML da segunda aula

A captura HTML da aula `lecture/13014304` mostra a estrutura `shaka-video-container` e o menu `captions-dropdown-menu`. Nesse HTML, `Português` aparece com `aria-checked="true"`, embora a captura visual do player continue mostrando `0:00 / 0:00` e `Carregado: NaN%`. A página, portanto, tem uma seleção de legenda no menu, mas a sessão de inspeção não forneceu um relógio de mídia válido nem evidência suficiente de `activeCues` nativas.
