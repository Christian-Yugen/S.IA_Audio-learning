# Protocolo experimental da Fase 2 — runtime Udemy

**Status:** aprovado para investigação controlada; implementação de produção não autorizada  
**Data:** 21 de agosto de 2026  
**Plataforma observada:** Udemy  
**Baseline protegido:** Coursera/S·IA 1.8.5

## 1. Objetivo

A Fase 2 deverá descobrir, em runtime autorizado, quais fontes de cue a Udemy realmente expõe: `HTMLMediaElement.textTracks`, elementos `<track>`, overlay DOM de legenda, painel de transcrição ou outra representação acessível ao content script.

O experimento não pretende ainda fazer a S·IA falar na Udemy. Seu resultado será um contrato de evidências para uma decisão posterior sobre implementação.

## 2. Isolamento obrigatório

O probe será criado fora de `extension/` e não poderá ser carregado pelo manifesto oficial. Ele terá manifesto próprio, nome visual explícito de experimento e escopo limitado à URL de aula fornecida.

| Regra | Obrigação |
|---|---|
| Código oficial | Não alterar `extension/` |
| `sync-engine.js` | Não importar, editar ou executar |
| Piper | Não importar, inicializar ou chamar |
| Voz nativa | Não chamar `speechSynthesis` |
| Player | Não clicar, pausar, reproduzir, buscar ou alterar velocidade |
| Rede | Não fazer chamadas próprias de rede |
| Dados | Não salvar cookies, tokens, identificadores de conta ou texto bruto de legenda |
| Relatório | Usar apenas métricas sanitizadas, hashes e estados técnicos |
| Remoção | Desinstalar/desativar o probe após o experimento |

A única alteração visual permitida será uma pequena camada diagnóstica removível do próprio probe, fora dos controles do player, para tornar o resultado verificável no navegador. O overlay não poderá interceptar eventos, bloquear cliques ou modificar elementos da Udemy.

## 3. Dados permitidos

O probe poderá coletar somente:

- existência e identidade técnica transitória do elemento `<video>`;
- `readyState`, `paused`, `currentTime` relativo, `duration`, `playbackRate` e contadores de eventos;
- quantidade e metadados não sensíveis de `TextTrack`/`<track>`;
- contagem de cues e `activeCues`;
- comprimento, quantidade de palavras e hash criptográfico de texto, sem texto bruto;
- contagem e presença de marcadores DOM de legenda/transcrição;
- contagem de mutações, reconstruções de player e timestamps relativos ao início do probe.

Os hashes de texto não deverão ser usados para reconstruir conteúdo. O relatório deverá remover URLs de sessão, IDs de usuário, tokens, cookies e qualquer conteúdo textual de aula.

## 4. Hipóteses e evidências

| Hipótese | Evidência mínima |
|---|---|
| `TextTrack` é utilizável | Lista de tracks, idioma, modo, quantidade de cues e active cues durante estado observável. |
| `<track>` é materializado | Elementos track, `kind`, `srclang`, `label`, `readyState` e quantidade de cues. |
| Overlay DOM fornece cue | Mudança de comprimento/hash em região identificada, correlacionável com tempo relativo. |
| Transcrição é fallback | Painel/linha ativa detectável e mudanças correlacionadas com estado do vídeo. |
| Player é recriado | Identidade de `video` ou contêiner muda, com observers removidos/reinstalados sem duplicação. |
| Fallback é seguro | Estado de fonte desconhecida não produz fala nem evento de produção. |

## 5. Eventos somente observados

O probe poderá instalar listeners passivos para `loadstart`, `loadedmetadata`, `durationchange`, `loadeddata`, `canplay`, `progress`, `timeupdate`, `play`, `pause`, `seeking`, `seeked`, `ratechange`, `ended`, `emptied` e `error`. Ele não poderá provocar nenhum deles.

Cada evento deverá ser registrado apenas como contador e timestamp relativo, com limite de amostra para impedir crescimento indefinido.

## 6. Critério de interrupção

O experimento deverá ser interrompido imediatamente se o probe:

- precisar clicar em um controle para continuar;
- exigir reprodução ou alteração de velocidade não explicitamente autorizada;
- encontrar conteúdo de conta que não possa ser sanitizado;
- interferir no player, no teclado, no áudio ou na navegação;
- modificar qualquer arquivo em `extension/`;
- produzir exceção que ameace a página da Udemy ou a extensão oficial.

## 7. Critério de sucesso

A Fase 2 será tecnicamente útil se conseguir responder, com evidência reproduzível, pelo menos uma das seguintes perguntas: se há `TextTrack` acessível; se há cues ou `activeCues`; se o DOM de legenda/transcrição muda durante estados observáveis; se o player é recriado; e qual diagnóstico deve ser exibido quando nenhuma fonte confiável está disponível.

A ausência de evidência também será resultado válido. Nesse caso, a decisão deverá favorecer um adaptador conservador, com fallback explícito e sem falar texto de baixa confiança.

## 8. Gate de integração

O resultado deste protocolo não autoriza a criação do adaptador de produção. Depois do relatório, será necessário comparar os resultados com o contrato em `docs/architecture/UDEMY-ADAPTER-DESIGN.md`, executar regressão Coursera e obter nova aprovação específica para qualquer implementação.

## 9. Rollback

O rollback consiste em remover/desativar o probe, fechar ou recarregar a aula e confirmar que a extensão oficial continua na versão 1.8.5. Nenhum commit de probe poderá ser mesclado em `main` junto com código de produção.

## Referências

- [Documento Mestre](../governance/MASTER-SIA-EXPANSION.md)
- [Especificação do adaptador Udemy](../architecture/UDEMY-ADAPTER-DESIGN.md)
- [Relatório de observação da Fase 1](../reports/PHASE1-UDEMY-OBSERVATION.md)
- [Pesquisa oficial inicial da Udemy](../research/UDEMY-OFFICIAL-RESEARCH.md)
