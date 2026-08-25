# Especificação do adaptador YouTube

## Documento de planejamento técnico — sem implementação

**Status:** Proposta para aprovação.

**Escopo:** reconhecimento de vídeos do YouTube, descoberta de fontes de legenda, normalização de cues, diagnóstico, fallback e integração com o S·IA Core.

**Não autorizado por este documento:** alteração do `sync-engine.js`, mudança do caminho Coursera, criação de fila própria, criação de bridge Piper separado, captura de conteúdo fora do vídeo aberto ou uso de texto sem timing confirmado.

## 1. Objetivo

O adaptador YouTube deverá traduzir o estado observável de uma página pública de vídeo em eventos padronizados que o núcleo S·IA já compreende. Ele será responsável por conhecer particularidades do YouTube, mas não poderá conter decisões de áudio, regras de sincronização ou lógica neural duplicada.

O primeiro objetivo será modesto: reconhecer a página, encontrar o player, observar a disponibilidade de uma fonte de legenda e emitir um diagnóstico compreensível. A fala automática somente será liberada quando uma cue temporal passar por todos os critérios de segurança.

## 2. Regras de autoridade

Esta especificação está subordinada ao [Documento Mestre](../governance/MASTER-SIA-EXPANSION.md). As regras abaixo são condições obrigatórias:

| Regra | Aplicação no YouTube |
|---|---|
| Preservar o Coursera | O caminho Coursera não será substituído nem generalizado sem aprovação extraordinária. |
| Um único núcleo de áudio | YouTube utilizará a mesma voz nativa, Piper, fila, pré-síntese, sincronização e fallback. |
| Diagnóstico e fallback primeiro | O protótipo deverá mostrar a fonte, confiança, estado e caminho alternativo desde o início. |
| Privacidade local | Não enviar legendas, histórico, cookies ou dados da conta para serviço externo. |
| Exceções somente com aprovação | Alteração de componente protegido exige hipóteses, evidências, métricas, regressão e aprovação explícita. |

## 3. Responsabilidades permitidas

| Responsabilidade | Permitida ao adaptador |
|---|---:|
| Reconhecer URL de vídeo ou página compatível | Sim |
| Detectar navegação SPA e mudança de vídeo | Sim |
| Localizar o elemento de vídeo | Sim |
| Observar TextTrack e `activeCues` | Sim |
| Observar overlay e transcrição | Sim, como fonte diagnosticável e sob validação |
| Associar texto a timing confirmado | Sim |
| Normalizar cue, fonte e confiança | Sim |
| Emitir diagnóstico | Sim |
| Criar fila de fala | Não |
| Chamar Piper diretamente | Não |
| Controlar `AudioContext` | Não |
| Ajustar velocidade para compensar a própria detecção | Não |
| Falar texto sem timing confiável | Não |
| Acessar cookies ou credenciais | Não |
| Enviar conteúdo para servidor | Não |

## 4. Padrão inicial de URL

A primeira hipótese de escopo é `https://www.youtube.com/watch*`. Ela deverá ser adicionada ao manifesto somente depois da aprovação do protótipo de observação e da revisão de permissões. Não incluir `m.youtube.com`, domínios de terceiros, páginas de incorporação ou `<all_urls>` sem investigação e decisão separadas.

O adaptador deverá reconhecer o vídeo por `v` ou por outros formatos de URL apenas quando o formato tiver sido observado e coberto por teste. URLs de playlist, Shorts, transmissões ao vivo, páginas de canal e vídeos incorporados deverão começar como estados explicitamente não suportados, e não como caminhos silenciosos de fallback.

## 5. Fontes candidatas de legenda

A ordem abaixo é uma hipótese de investigação. A ordem de produção somente poderá ser definida após evidências:

| Fonte | Papel candidato | Condição mínima |
|---|---|---|
| `video.textTracks` e `activeCues` | Fonte temporal principal possível | Texto, idioma, início, fim e cue ativa coerentes. |
| Metadados de tracks da página | Descoberta/diagnóstico | Não persistir URL assinada; confirmar associação com o player ativo. |
| Estado ou evento observável do player | Alternativa possível | Contrato observado e repetível; sem depender de chamada privada frágil. |
| Overlay de captions | Fallback de compatibilidade | Timing confirmado por outra fonte ou relógio confiável. |
| Linha atual da transcrição | Fallback possível | Correlação repetível com o instante do vídeo. |
| Transcrição sem tempo | Diagnóstico/navegação | Nunca autoriza fala automática sozinha. |

A presença de `captionTracks` ou de texto visível não é suficiente para `safeToSpeak`. O adaptador deve confirmar que a fonte pertence ao vídeo ativo e que o tempo atual está dentro de uma cue válida.

## 6. Cue normalizada

O contrato deverá ser compatível com o núcleo e conter o mínimo abaixo:

```javascript
{
  platformId: "youtube",
  adapterVersion: "youtube-v0-experimental",
  videoId: "local-context",
  text: "Texto validado da legenda",
  startTime: 10.25,
  endTime: 14.80,
  source: "texttrack",
  sourceConfidence: "high",
  playerIdentity: {
    videoId: "local-context",
    playerElement: "movie-player"
  },
  safeToSpeak: true
}
```

`videoId` e `playerIdentity` devem conter somente o contexto mínimo necessário. Não capturar URL assinada, token, cookie, conteúdo integral do player ou dados pessoais.

A função de normalização deverá rejeitar texto vazio, idioma indefinido quando o idioma for necessário, tempos não numéricos, `endTime` menor ou igual a `startTime`, cue fora do vídeo ativo e fonte de confiança insuficiente. A rejeição deverá gerar diagnóstico, não exceção não tratada.

## 7. Máquina de estados

```text
IDLE
  ↓ URL de vídeo reconhecida
PLATFORM_DETECTED
  ↓ player encontrado
PLAYER_FOUND
  ↓ fontes observadas
WAITING_FOR_CAPTIONS
  ├── fonte temporal confirmada → PRIMARY_READY
  ├── fonte alternativa investigada → FALLBACK_PROBING
  └── texto sem timing → UNSAFE_TO_SPEAK
PRIMARY_READY / FALLBACK_READY
  ↓ cue validada
EMITTING_CUE
  ↓ troca de vídeo, player ou página
DESTROYING
```

`UNSAFE_TO_SPEAK` é um estado obrigatório. O texto poderá aparecer em diagnóstico ou ser usado para navegação manual, mas não poderá alimentar fala automática.

## 8. Ciclo de vida e SPA

O YouTube deve ser tratado como uma aplicação dinâmica. O adaptador deverá observar mudança de URL, troca de vídeo sem recarga completa, criação ou remoção do player, pausa, reprodução, seek, rate change, troca de idioma, ativação de captions e destruição da página.

A reconexão deverá ser idempotente. Nova varredura não pode instalar listeners duplicados, manter referências do vídeo anterior ou repetir a última cue sem mudança temporal real. Ao sair da página compatível, o adaptador deverá remover observers e listeners e emitir `SIA_PLATFORM_LEFT`.

## 9. Diagnóstico

O diagnóstico mínimo deverá informar plataforma, versão do adaptador, presença do player, identidade do vídeo, fonte, idioma quando disponível, confiança, estado, motivo, segurança para fala e ação recomendada.

| Estado | Mensagem sugerida |
|---|---|
| URL reconhecida, player ausente | `YouTube detectado; aguardando o player.` |
| Player encontrado, sem captions | `Player encontrado; ative uma legenda disponível.` |
| Transcrição disponível sem timing | `Transcrição encontrada; timing ainda não confirmado.` |
| Fonte temporal pronta | `Legenda temporal confirmada.` |
| Fallback em investigação | `Fonte principal indisponível; verificando alternativa.` |
| Texto sem segurança | `Legenda não confirmada; leitura suspensa.` |
| Motor neural aquecendo | `Voz neural local preparando o motor.` |
| Fallback de áudio | `Piper indisponível; voz do navegador ativada.` |
| Erro do adaptador | `A S·IA não conseguiu resolver este vídeo com segurança.` |

Nenhum diagnóstico deverá incluir tokens, cookies, URLs assinadas, conteúdo de conta ou transcrição completa por padrão.

## 10. Separação dos fallbacks

O fallback de legenda tenta localizar outra fonte de texto e timing. O fallback de áudio ocorre somente depois que uma cue segura entrou no núcleo e o Piper falhou. Um não substitui o outro.

Texto de overlay ou transcrição sem timing não deve ser enviado ao `falar()`. Se o fallback não conseguir provar o tempo, o estado deve permanecer `UNSAFE_TO_SPEAK`. Se uma cue segura for emitida e o provider neural falhar, o núcleo comum poderá usar a voz nativa conforme o comportamento já validado no Coursera.

## 11. Integração com o núcleo

O adaptador deverá emitir os eventos comuns abaixo:

```text
SIA_PLATFORM_DETECTED
SIA_PLAYER_FOUND
SIA_CAPTION_SOURCE_READY
SIA_CAPTION_CHANGED
SIA_CUE_COMPLETED
SIA_ADAPTER_FALLBACK
SIA_ADAPTER_ERROR
SIA_PLATFORM_LEFT
```

O núcleo continuará responsável por decidir se a fala está habilitada, escolher browser ou Piper, estimar e corrigir sincronização, manter fila e pré-síntese, reproduzir áudio, cancelar fala, executar fallback de áudio, salvar histórico e emitir status.

O adaptador não poderá importar o provider neural para acioná-lo diretamente, criar `youtube-sync-engine.js`, criar fila de YouTube ou ajustar a taxa do vídeo para compensar atraso próprio.

## 12. Hipóteses de investigação

| ID | Hipótese | Evidência necessária |
|---|---|---|
| YT-H01 | `TextTrack` expõe cues utilizáveis no vídeo principal. | Várias cues com tempo correto em mais de um vídeo. |
| YT-H02 | Tracks identificadas no estado inicial correspondem ao player ativo. | Associação repetível sem persistir URL assinada. |
| YT-H03 | O overlay muda de forma observável. | Mutação correlacionada com cue temporal e sem duplicatas. |
| YT-H04 | A transcrição mantém linha atual temporalmente correlacionável. | Correspondência repetida entre linha e relógio do vídeo. |
| YT-H05 | A navegação SPA exige ciclo de vida próprio. | Troca de vídeo sem reload sem listeners duplicados. |
| YT-H06 | Vídeos e captions automáticas têm variações de idioma/qualidade. | Diagnóstico identifica fonte e confiança corretamente. |
| YT-H07 | Uma ponte de mundo da página é necessária. | TextTrack/DOM/transcrição insuficientes, com alternativa mínima e reversível. |

Pelo menos três hipóteses deverão ser investigadas antes da seleção da fonte principal. Uma hipótese não confirmada permanecerá marcada como desconhecida.

## 13. Matriz de testes inicial

| Cenário | Resultado esperado |
|---|---|
| Domínio não compatível | Nenhuma interferência. |
| Página `/watch` sem player | Estado de espera, sem erro. |
| Vídeo com captions desligadas | Diagnóstico claro, sem fala automática. |
| `TextTrack` temporal disponível | Cue normalizada, única e segura. |
| Captions automáticas | Origem e confiança explicitadas. |
| Transcrição sem timing | `UNSAFE_TO_SPEAK`, sem fala. |
| Cue repetida | Uma única emissão. |
| Pausa | Nenhuma fala nova fora do estado permitido. |
| Seek | Fila e cue atual reconciliadas pelo núcleo comum. |
| Troca de vídeo SPA | Destruição e reconexão sem duplicatas. |
| Player recriado | Nova identidade e listeners corretos. |
| Mudança de idioma | Fonte e diagnóstico atualizados. |
| Erro Piper | Fallback para browser, sem fila paralela. |
| Coursera após a mudança | Regressão completa aprovada. |
| Udemy após a mudança | Regressão do adaptador e do núcleo aprovada. |

## 14. Gates de implementação

| Gate | Condição |
|---|---|
| Y0 | Baseline 1.8.14 reproduzível e `sync-engine.js` protegido. |
| Y1 | Observação passiva concluída em vídeos públicos autorizados. |
| Y2 | Pelo menos três hipóteses investigadas com evidências. |
| Y3 | Contrato de cue e estados definidos em fixtures sintéticas. |
| Y4 | Diagnóstico e fallback testados antes de áudio. |
| Y5 | Protótipo isolado em branch própria e fora do caminho Coursera. |
| Y6 | Voz nativa testada pelo núcleo compartilhado. |
| Y7 | Piper e fallback de áudio testados, quando o gate for autorizado. |
| Y8 | Regressão Coursera/Udemy e rollback aprovados. |
| Y9 | Usuário aprova explicitamente a promoção para experimental. |

Nenhum gate autoriza automaticamente alteração em componente protegido. Uma exceção exige o protocolo do Documento Mestre.

## 15. Fora do escopo inicial

Ficam fora desta etapa tradução automática, geração de transcrição por servidor, sincronização em nuvem, conta própria da S·IA, captura de áudio para reconhecimento remoto, download de conteúdo, bypass de restrições do YouTube, automação de controles, Shorts, live streaming, páginas de canal, vídeos incorporados e qualquer promessa de precisão profissional.

## 16. Critério de pronto

O desenho somente será considerado pronto para implementação quando as hipóteses relevantes forem observadas, a fonte candidata e seus limites forem documentados, o fallback tiver confiança definida, o contrato estiver coberto por fixtures, o ciclo SPA estiver coberto por testes, a privacidade estiver revisada, o rollback estiver preparado e o responsável autorizar explicitamente o próximo gate.

## Referências

- [Pesquisa oficial inicial — YouTube e S·IA](../research/YOUTUBE-OFFICIAL-RESEARCH.md)
- [Arquitetura do sistema](SYSTEM-ARCHITECTURE.md)
- [Documento Mestre](../governance/MASTER-SIA-EXPANSION.md)
