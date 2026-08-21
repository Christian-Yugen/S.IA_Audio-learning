# Documento Mestre da S·IA
## Expansão multiplataforma, preservação arquitetural e controle de mudanças

**Projeto:** S·IA — Audio-learning by UXBRAS®  
**Documento:** Norma Mestre de Arquitetura e Evolução  
**Versão do documento:** 1.0  
**Data de emissão:** 21 de agosto de 2026  
**Status:** Normativo, obrigatório e vinculante para toda evolução futura da extensão  
**Autor:** Manus AI  
**Plataforma inicialmente protegida:** Coursera  
**Próxima plataforma-alvo:** Udemy

---

## 1. Mandato principal

Este documento é a **fonte de verdade** para a expansão da S·IA para outras plataformas de cursos online. Toda análise, implementação, teste, correção, refatoração, integração, empacotamento ou publicação futura deverá obedecer integralmente às regras aqui estabelecidas.

A expansão da S·IA deverá ocorrer por meio de **acréscimos isolados, reversíveis, diagnosticáveis e compatíveis**. A existência de uma nova plataforma jamais constitui, por si só, justificativa para alterar o funcionamento já validado do Coursera ou duplicar a lógica central de áudio.

> **Regra de autoridade:** nenhuma mudança protegida por este documento poderá ser executada apenas porque parece tecnicamente conveniente. Qualquer exceção dependerá do protocolo formal de exceção e de aprovação prévia, explícita e registrada do usuário.

Este documento não é uma sugestão de boas práticas. Ele é um **contrato técnico de preservação do produto**.

---

## 2. Objetivo do documento

O objetivo é permitir que a S·IA evolua de uma extensão integrada ao Coursera para uma solução multiplataforma de leitura, sincronização e síntese de legendas, sem perder a estabilidade conquistada na versão funcional existente.

A expansão deverá preservar simultaneamente:

| Dimensão protegida | Exigência obrigatória |
|---|---|
| **Funcionamento atual** | O caminho validado do Coursera não pode ser quebrado, substituído ou degradado. |
| **Áudio** | Coursera e novas plataformas devem utilizar o mesmo núcleo de voz, fila, sincronização, Piper e fallback. |
| **Compatibilidade** | Cada plataforma deve possuir um adaptador próprio, isolado e reversível. |
| **Diagnóstico** | O usuário deve saber se a legenda veio da fonte principal ou de um fallback. |
| **Segurança operacional** | Toda mudança deverá possuir testes, evidências, versão e caminho de rollback. |
| **Privacidade** | A inferência neural deve continuar local; não haverá servidor obrigatório para gerar voz. |

---

## 3. Regras invioláveis

As três regras a seguir são o núcleo absoluto deste documento. Elas não podem ser flexibilizadas, reinterpretadas ou contornadas durante o desenvolvimento normal.

### Regra 1 — Preservação absoluta do Coursera

**Nenhuma alteração no motor funcional atual do Coursera.** O adaptador existente deve ser preservado e qualquer novo suporte deve ser aditivo.

Isso significa que:

- o caminho de detecção e leitura já validado no Coursera não deve ser substituído por um caminho genérico sem aprovação excepcional;
- o `sync-engine.js` deve permanecer preservado, salvo aprovação formal nos termos da Seção 12;
- o comportamento da voz nativa do navegador deve permanecer disponível e funcional;
- o motor neural Piper deve continuar opcional, desligado por padrão e com fallback automático para a voz do navegador;
- uma correção específica da Udemy não pode ser aplicada diretamente ao fluxo do Coursera apenas para reaproveitar código;
- qualquer código compartilhado deverá ser introduzido fora do caminho protegido ou demonstrar, por testes, que não altera o comportamento anterior;
- se houver dúvida sobre o impacto, a mudança será considerada proibida até que a dúvida seja resolvida por evidência.

A preservação inclui não apenas a aparência da interface, mas também a detecção das legendas, o cálculo de sincronização, a fila de fala, o fallback, a operação da voz nativa, a seleção do motor e o comportamento comprovado nas versões anteriores.

### Regra 2 — Um único núcleo de áudio

**Nenhuma cópia independente da lógica de áudio.** Coursera e Udemy devem utilizar o mesmo núcleo de voz, fila, sincronização, Piper e fallback.

O núcleo único deverá concentrar:

| Componente | Regra de compartilhamento |
|---|---|
| Voz nativa | Uma única implementação para todas as plataformas compatíveis. |
| Piper PT-BR | Um único provedor neural local, opcional e acionável. |
| Fila de fala | Uma única política de enfileiramento, cancelamento e deduplicação. |
| Sincronização | Um único motor, sem versões paralelas por plataforma. |
| Pré-síntese | Uma única estratégia de aquecimento e preparação da próxima legenda. |
| Fallback | Uma única política de retorno à voz do navegador. |
| Diagnóstico de áudio | Um único conjunto de estados e códigos de erro. |

Um adaptador de plataforma poderá informar **qual legenda deve ser lida**, mas não poderá decidir como o áudio será sincronizado, gerado, enfileirado ou reproduzido.

A criação de arquivos como `udemy-sync-engine.js`, `udemy-piper-bridge.js`, `coursera-audio.js` ou equivalentes será considerada violação desta regra, salvo aprovação excepcional expressa e documentada.

### Regra 3 — Diagnóstico e fallback desde o primeiro protótipo

**Diagnóstico e fallback devem existir desde o primeiro protótipo de cada nova plataforma.**

O usuário deverá conseguir identificar:

- qual plataforma foi reconhecida;
- qual adaptador está ativo;
- qual vídeo foi localizado;
- se a legenda foi obtida pela fonte principal;
- se uma estratégia alternativa foi utilizada;
- se a extensão está aguardando o player ou a legenda;
- qual motor de voz está ativo;
- se o áudio está pronto, falando, em fila, aquecendo ou em fallback;
- qual falha ocorreu, quando houver falha.

Nenhum protótipo será considerado funcional se apenas “parecer funcionar” sem informar a fonte da legenda e o caminho efetivamente utilizado.

---

## 4. Princípios complementares obrigatórios

As regras centrais são reforçadas pelos seguintes princípios.

### 4.1 Desenvolvimento aditivo por padrão

Toda implementação deverá preferir adicionar novos módulos, adaptadores, eventos, testes e estados, em vez de reescrever funções existentes. Uma função funcional não deverá ser modificada para acomodar uma nova plataforma quando for possível criar uma camada de adaptação ao redor dela.

Quando uma integração exigir uma alteração em uma interface existente, a primeira alternativa a ser investigada deverá ser a criação de um novo ponto de extensão, um evento, um contrato de adaptador ou uma camada de compatibilidade.

### 4.2 Isolamento por adaptador

Cada plataforma deverá possuir um adaptador próprio, responsável exclusivamente por traduzir a estrutura daquela plataforma para eventos padronizados da S·IA.

O adaptador não deverá:

- duplicar a fila de fala;
- controlar diretamente o Piper;
- implementar sua própria sincronização;
- alterar a velocidade do vídeo para compensar áudio;
- substituir o player da plataforma;
- esconder os controles originais sem autorização específica;
- interferir no motor de outra plataforma;
- presumir que elementos encontrados em um site existirão em outro.

### 4.3 Compatibilidade progressiva

A S·IA não deverá prometer suporte total a uma plataforma antes de validar as situações essenciais. O suporte deverá ser declarado por nível:

| Nível | Significado |
|---|---|
| **Experimental** | O adaptador foi criado e funciona em fixtures ou cenários limitados, mas ainda não atende a todos os critérios de produção. |
| **Compatível** | O adaptador passou pela matriz mínima de testes e possui fallback e diagnóstico. |
| **Validado** | O adaptador passou por testes automatizados, reprodução real e regressão nas plataformas já protegidas. |
| **Temporariamente suspenso** | Uma alteração da plataforma provocou falha; o adaptador permanece isolado sem comprometer o núcleo. |

### 4.4 Falha segura

Quando a plataforma não puder ser interpretada com segurança, a S·IA deverá preferir informar que não conseguiu detectar a legenda, aguardar o carregamento ou desativar apenas o adaptador afetado. Ela não deverá falar texto incorreto, duplicar frases ou interferir no vídeo como tentativa silenciosa de recuperação.

### 4.5 Privacidade e funcionamento local

O motor neural deverá continuar sendo executado localmente no navegador, com os arquivos necessários distribuídos junto à extensão. O funcionamento básico não deverá depender de envio de legendas para servidor de inferência.

Qualquer futura função que utilize processamento remoto deverá ser explicitamente opcional, claramente identificada e separada do caminho local. A ausência desse serviço não poderá quebrar a leitura nativa nem o Piper local.

### 4.6 Reversibilidade

Toda mudança relevante deverá poder ser desativada por flag, versão, adaptador ou rollback de pacote. Não será aceitável uma alteração que só possa ser removida por reconstrução manual de todo o projeto.

---

## 5. Arquitetura de referência obrigatória

A arquitetura de expansão deverá seguir a separação abaixo.

```text
┌─────────────────────────────────────────────┐
│             Plataformas de cursos           │
│       Coursera · Udemy · futuras plataformas │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│          Adaptadores isolados de plataforma  │
│   Coursera Adapter · Udemy Adapter · outros  │
└──────────────────────┬──────────────────────┘
                       │ eventos padronizados
                       ▼
┌─────────────────────────────────────────────┐
│                 S·IA Core                    │
│ descoberta de cue · estado · fila · sync     │
│ voz nativa · Piper · pré-síntese · fallback  │
└──────────────────────┬──────────────────────┘
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
┌──────────────────┐       ┌──────────────────┐
│ Diagnóstico       │       │ Aprendizagem      │
│ fonte · estados   │       │ notas · revisão   │
│ erros · métricas  │       │ flashcards        │
└──────────────────┘       └──────────────────┘
```

### 5.1 S·IA Core

O núcleo deverá ser agnóstico à plataforma. Ele recebe uma legenda normalizada, seu intervalo temporal e o contexto necessário, e executa as políticas comuns de áudio.

São responsabilidades do núcleo:

- manter o motor nativo como padrão;
- ativar o Piper apenas quando o usuário selecionar essa opção;
- aquecer o Worker e o runtime local;
- gerar ou recuperar áudio do cache;
- deduplicar requisições em andamento;
- enfileirar e cancelar fala;
- pré-sintetizar a próxima legenda;
- aplicar o sincronismo já validado;
- retornar à voz do navegador em caso de falha;
- expor estados diagnósticos padronizados.

### 5.2 Adaptadores

Cada adaptador deverá implementar, de forma isolada, um contrato equivalente ao seguinte:

```javascript
const adapter = {
  id: "platform-id",
  version: "adapter-version",
  matchesLocation() {},
  findVideo() {},
  getCaptionSource() {},
  getCurrentCaption() {},
  observeCaptionChanges() {},
  getCourseContext() {},
  getDiagnostics() {},
  destroy() {}
};
```

Esse contrato é conceitual. A implementação real poderá utilizar outro formato, desde que preserve a separação de responsabilidades e não replique a lógica de áudio.

O adaptador deverá emitir dados normalizados, incluindo pelo menos:

| Campo | Finalidade |
|---|---|
| `platformId` | Identificar a plataforma. |
| `adapterVersion` | Identificar a versão do adaptador. |
| `captionText` | Texto da legenda atual. |
| `startTime` | Início temporal da cue, quando disponível. |
| `endTime` | Fim temporal da cue, quando disponível. |
| `source` | `primary`, `dom`, `event`, `fallback` ou equivalente. |
| `sourceConfidence` | Confiança da detecção. |
| `courseContext` | Curso, aula ou contexto disponível sem expor dados desnecessários. |
| `diagnostics` | Estado detalhado da resolução. |

### 5.3 Camada educacional

A camada educacional deverá ser independente dos adaptadores e do áudio. Notas, marcadores, flashcards, perguntas e revisão deverão consumir eventos normalizados da S·IA, como `SIA_CAPTION_CHANGED` e `SIA_CUE_COMPLETED`.

A ausência ou desativação dessa camada não poderá interferir no funcionamento de voz, sincronização ou fallback.

---

## 6. Contrato de eventos padronizados

A integração entre adaptadores e núcleo deverá utilizar eventos claros, observáveis e testáveis.

| Evento | Quando ocorre | Consumidores permitidos |
|---|---|---|
| `SIA_PLATFORM_DETECTED` | Uma plataforma compatível é reconhecida. | Núcleo, diagnóstico e interface. |
| `SIA_PLAYER_FOUND` | O vídeo ou player foi localizado. | Diagnóstico e núcleo. |
| `SIA_CAPTION_SOURCE_READY` | Uma fonte de legenda foi identificada. | Núcleo e diagnóstico. |
| `SIA_CAPTION_CHANGED` | A cue ativa mudou. | Núcleo de áudio e camada educacional. |
| `SIA_CUE_COMPLETED` | A cue foi considerada processada. | Cache, pré-síntese e aprendizagem. |
| `SIA_ADAPTER_FALLBACK` | A estratégia principal falhou e uma alternativa foi acionada. | Diagnóstico e interface. |
| `SIA_ADAPTER_ERROR` | O adaptador não conseguiu resolver a situação com segurança. | Diagnóstico e controle de falha. |
| `SIA_AUDIO_STATE_CHANGED` | O motor mudou de estado. | Interface e diagnóstico. |
| `SIA_PLATFORM_LEFT` | O usuário saiu da página compatível. | Limpeza e destruição do adaptador. |

O evento `SIA_CAPTION_CHANGED` deverá carregar a origem da legenda. Não será permitido enviar somente o texto e perder a informação sobre como ele foi obtido.

---

## 7. Estado protegido do Coursera

Antes de iniciar qualquer expansão, deverá existir uma fotografia do estado funcional conhecido do Coursera. Essa fotografia servirá como baseline de comparação.

O baseline deverá preservar, no mínimo:

| Item | Estado obrigatório |
|---|---|
| Motor padrão | Voz do navegador. |
| Motor neural | Opcional, desligado por padrão. |
| Fallback | Retorno automático para voz nativa. |
| Sincronização | Motor existente preservado. |
| `sync-engine.js` | Sem alteração não autorizada. |
| Content script | Caminho Coursera preservado. |
| Worker neural | Executado no host offscreen da extensão. |
| Popup | Sem carregamento direto de `piper-bridge.js`. |
| Diagnóstico | Estados de motor, fila e erro disponíveis. |
| Testes | Regressão automatizada aprovada. |

O hash conhecido do `sync-engine.js` funcional é:

```text
8c2e9ad28c1c570e44d4c3c42148ada403dec696864b21675aedd2d6d9bef00a
```

Qualquer divergência deverá interromper a entrega até que seja explicada e, se envolver alteração do arquivo, aprovada de acordo com a Seção 12.

---

## 8. Processo obrigatório para adicionar uma nova plataforma

Nenhuma nova plataforma poderá ser adicionada diretamente ao pacote final. O desenvolvimento deverá seguir as fases abaixo, em ordem.

### Fase 0 — Registro da hipótese e do escopo

Antes de editar código, deverá ser registrado:

- a plataforma alvo;
- o comportamento que se deseja suportar;
- a fonte de legenda que se pretende observar;
- as hipóteses sobre o player e o carregamento;
- os riscos conhecidos;
- os arquivos protegidos que não serão modificados;
- os critérios de sucesso;
- o plano de fallback;
- o plano de diagnóstico;
- a forma de rollback.

Não será permitido começar pela alteração do núcleo apenas porque a estrutura da nova plataforma ainda não foi compreendida.

### Fase 1 — Observação passiva

A primeira investigação deverá observar a plataforma sem interferir no player, sem substituir controles e sem introduzir a voz neural. O objetivo é descobrir como o vídeo e as legendas se comportam em situações reais.

Deverão ser observados, quando aplicável:

| Situação | Deve ser verificada |
|---|---:|
| Player antes do carregamento | Sim |
| Player após o carregamento | Sim |
| Legenda desativada | Sim |
| Legenda ativada | Sim |
| Troca de cue | Sim |
| Pausa e retomada | Sim |
| Busca no vídeo | Sim |
| Mudança de velocidade | Sim |
| Troca de aula | Sim |
| Página dinâmica ou SPA | Sim |
| Player em iframe ou contexto isolado | Sim |
| Remoção e recriação do player | Sim |

### Fase 2 — Adaptador mínimo

O primeiro protótipo deverá conter apenas o adaptador da plataforma, a identificação da fonte de legenda e o diagnóstico. A voz deverá continuar desligada ou utilizar um modo de teste controlado.

O protótipo deverá demonstrar que consegue emitir cues corretas sem alterar o Coursera e sem duplicar o núcleo de áudio.

### Fase 3 — Integração com o núcleo existente

Somente após o adaptador mínimo estar diagnosticável ele poderá enviar eventos ao mesmo núcleo de áudio utilizado pelo Coursera.

Nesta fase não será permitido criar uma fila paralela, um sincronizador paralelo ou uma ponte neural específica da nova plataforma.

### Fase 4 — Fallback

A fonte principal deverá ser testada contra as estratégias alternativas. O fallback deverá ser acionado somente quando a estratégia principal não produzir dados confiáveis.

O diagnóstico deverá informar a transição, por exemplo:

```text
Plataforma: Udemy
Adaptador: udemy-v1
Fonte principal: indisponível
Fallback ativo: leitura DOM
Confiança: média
Motor: voz nativa do navegador
Estado: funcional com compatibilidade reduzida
```

### Fase 5 — Testes e validação real

O adaptador deverá passar pela matriz da Seção 9. A validação deverá incluir aulas reais ou fixtures controladas que representem os estados importantes da plataforma.

### Fase 6 — Empacotamento isolado

A nova plataforma deverá ser incluída com identificação de versão própria do adaptador e sem alterar silenciosamente o comportamento do Coursera. O pacote só poderá ser liberado após a lista de aceitação da Seção 10 estar completa.

---

## 9. Matriz mínima de testes

A matriz abaixo é obrigatória para qualquer nova plataforma.

### 9.1 Testes do adaptador

| Teste | Resultado esperado |
|---|---|
| Reconhecimento da plataforma | O adaptador ativa somente no domínio e contexto corretos. |
| Não reconhecimento de outros sites | O adaptador não interfere em páginas não compatíveis. |
| Player inexistente | Diagnóstico informa que está aguardando o player. |
| Player encontrado | Diagnóstico confirma o vídeo correto. |
| Legenda inexistente | Usuário recebe orientação clara, sem erro silencioso. |
| Legenda principal disponível | Texto e tempo são capturados corretamente. |
| Troca de cue | Cada cue válida é emitida uma única vez. |
| Cue repetida | A duplicação é descartada sem fala repetida indevida. |
| Pausa | O adaptador não cria sequência incorreta de cues. |
| Busca no vídeo | O estado anterior é limpo ou reconciliado corretamente. |
| Troca de aula | O contexto anterior é destruído. |
| Player recriado | O adaptador consegue se reconectar ou informa falha. |
| Fallback | A fonte alternativa é acionada e identificada. |
| Fallback inválido | Texto de baixa confiança não é falado silenciosamente. |

### 9.2 Testes do núcleo de áudio

A nova plataforma deverá utilizar os mesmos testes do núcleo existente:

- motor nativo como padrão;
- ativação explícita do Piper;
- aquecimento do runtime;
- geração local;
- cache;
- deduplicação de requisições;
- pré-síntese da próxima cue;
- cancelamento;
- fallback automático;
- tratamento de contexto invalidado;
- ausência de chamada de rede para inferência neural;
- funcionamento do host offscreen;
- transporte correto de PCM;
- ausência de áudio duplicado.

### 9.3 Testes de não regressão do Coursera

Toda versão que inclua uma nova plataforma deverá repetir os testes do Coursera, mesmo que o código do adaptador Coursera não tenha sido intencionalmente tocado.

A justificativa é que alterações em manifest, content scripts, roteamento de mensagens, listeners globais, armazenamento ou inicialização podem causar regressões indiretas.

### 9.4 Teste físico mínimo

Antes da entrega, deverá ser demonstrado no navegador:

| Verificação | Obrigatória |
|---|---:|
| Coursera com voz nativa | Sim |
| Coursera com Piper | Sim, quando o modelo estiver presente |
| Coursera com fallback | Sim |
| Nova plataforma com voz nativa | Sim |
| Nova plataforma com Piper | Sim, quando suportado |
| Nova plataforma com fallback | Sim |
| Alternância entre motores | Sim |
| Recarga da página | Sim |
| Fechamento e reabertura da aba | Sim |
| Ausência de erro crítico no console | Sim |

---

## 10. Critérios de aceitação para uma nova plataforma

Uma nova plataforma somente poderá ser marcada como compatível quando todos os critérios abaixo forem atendidos.

| Critério | Obrigatório |
|---|---:|
| Adaptador isolado e identificável | Sim |
| Núcleo de áudio compartilhado | Sim |
| Coursera inalterado no caminho funcional | Sim |
| Diagnóstico da fonte da legenda | Sim |
| Fallback implementado desde o protótipo | Sim |
| Motor nativo funcionando | Sim |
| Piper opcional funcionando, quando aplicável | Sim |
| Testes automatizados | Sim |
| Teste físico no navegador | Sim |
| Regressão do Coursera | Sim |
| Mensagem de limitação para o usuário | Sim |
| Rollback documentado | Sim |
| Registro de arquivos alterados | Sim |
| Verificação de permissões e CSP | Sim |
| Verificação de conformidade com as regras de uso da plataforma | Sim |

Se um único critério obrigatório falhar, o suporte deverá permanecer como **experimental** ou ser suspenso. Não poderá ser apresentado como estável.

---

## 11. Diagnóstico obrigatório para o usuário

O diagnóstico não deve ser reservado ao console de desenvolvimento. O painel da S·IA deverá oferecer uma visão compreensível do estado atual.

### 11.1 Estados mínimos

```text
PLATFORM_UNKNOWN
PLATFORM_DETECTED
WAITING_FOR_PLAYER
PLAYER_FOUND
WAITING_FOR_CAPTIONS
CAPTION_SOURCE_PRIMARY
CAPTION_SOURCE_FALLBACK
AUDIO_BROWSER_READY
AUDIO_PIPER_WARMING
AUDIO_PIPER_READY
AUDIO_PLAYING
AUDIO_QUEUED
AUDIO_FALLBACK_BROWSER
ADAPTER_ERROR
```

### 11.2 Informações mínimas exibidas

| Informação | Exemplo |
|---|---|
| Plataforma | Coursera ou Udemy |
| Adaptador | `coursera-v1` ou `udemy-v1` |
| Fonte da legenda | Principal, DOM, evento ou fallback |
| Confiança | Alta, média ou baixa |
| Motor de voz | Navegador ou Piper PT-BR |
| Estado do áudio | Pronto, falando, em fila ou fallback |
| Legenda atual | Texto resumido ou acessível ao usuário |
| Próxima legenda | Quando disponível |
| Último erro | Mensagem compreensível |
| Ação sugerida | Ativar legenda, recarregar aula, testar voz etc. |

A S·IA não deverá informar “sincronizado” quando estiver falando uma legenda cuja origem não foi confirmada.

---

## 12. Protocolo extraordinário de alteração das regras

As regras deste documento só poderão ser alteradas em um **caso extraordinário de melhoria comprovadamente superior**, e nunca por conveniência, pressa, dificuldade de implementação ou preferência estética.

### 12.1 O que pode ser considerado extraordinário

Uma alteração protegida somente poderá ser avaliada quando houver evidência de que manter a regra atual produz um problema real, relevante e reproduzível, e de que nenhuma solução aditiva, isolada ou compatível resolve o problema adequadamente.

Exemplos de justificativas potencialmente elegíveis:

- uma mudança estrutural da plataforma torna impossível detectar a legenda sem tocar em uma interface protegida;
- um erro crítico reproduzível impede uma função essencial e não pode ser resolvido por adaptador ou fallback;
- uma alteração proposta elimina uma falha grave de compatibilidade com melhoria mensurável e sem regressão;
- uma restrição técnica comprovada impede a arquitetura atual, depois que alternativas aditivas foram testadas e rejeitadas com evidências.

“Ficaria mais limpo”, “seria mais fácil”, “reduziria algumas linhas” ou “seria mais moderno” não são justificativas extraordinárias.

### 12.2 Condições cumulativas obrigatórias

Todas as condições abaixo deverão ser atendidas antes de solicitar aprovação:

1. O problema deverá ter sido reproduzido de forma controlada e documentada.
2. Deverão ser levantadas e analisadas várias hipóteses plausíveis, com registro do resultado de cada uma.
3. Deverão ser investigadas soluções aditivas, isoladas, por adaptador, por fallback e por configuração.
4. Deverá ser demonstrado por que essas soluções não resolvem o problema.
5. A alteração proposta deverá ter escopo mínimo e claramente delimitado.
6. Deverá existir teste automatizado ou fixture reproduzível antes da mudança protegida.
7. Deverá existir plano de rollback executável.
8. Deverá ser apresentado resultado comparativo antes/depois.
9. Deverá ser repetida a regressão completa do Coursera.
10. O usuário deverá aprovar a alteração de forma prévia, explícita e registrada.

Mesmo após o cumprimento de todas as condições, a alteração permanecerá proibida até a aprovação do usuário.

### 12.3 Padrão mínimo de prova

Para que uma melhoria seja considerada suficientemente comprovada, a proposta deverá apresentar, conforme aplicável:

| Evidência | Padrão mínimo |
|---|---|
| Reprodução do problema | Pelo menos 3 execuções independentes ou 3 cenários representativos. |
| Hipóteses analisadas | Pelo menos 3 hipóteses plausíveis, quando o problema comportar essa análise. |
| Repetição da melhoria | Pelo menos 5 execuções comparáveis, sem depender de um caso isolado. |
| Ganho mensurável | Melhoria substancial em uma métrica definida previamente ou eliminação completa de uma falha crítica. |
| Regressão protegida | Testes automatizados e validação física do Coursera aprovados. |
| Rollback | Procedimento testado ou demonstrado em ambiente controlado. |

Os números acima são o padrão mínimo de evidência, não uma garantia automática de aprovação.

### 12.4 Solicitação formal de aprovação

A solicitação deverá ser apresentada ao usuário em linguagem clara e conter:

```text
ID da exceção:
Regra afetada:
Arquivo ou componente protegido:
Problema reproduzido:
Impacto para o usuário:
Hipóteses analisadas:
Soluções aditivas rejeitadas e motivos:
Alteração proposta:
Métrica antes/depois:
Riscos conhecidos:
Plano de rollback:
Testes executados:
Resultado da regressão do Coursera:
Escopo exato da autorização solicitada:
```

A autorização deverá mencionar explicitamente **qual regra**, **qual arquivo ou componente**, **qual alteração** e **qual versão** estão aprovados. Uma autorização genérica para “melhorar a extensão” não será considerada suficiente.

### 12.5 Limite da autorização

A aprovação de uma exceção será válida somente para o escopo descrito. Ela não autoriza automaticamente:

- outras alterações no mesmo arquivo;
- alterações em outros componentes;
- refatorações aproveitando a mesma oportunidade;
- remoção dos testes;
- mudança do motor nativo;
- duplicação do núcleo de áudio;
- abandono do diagnóstico ou do fallback.

Qualquer ampliação exigirá nova aprovação.

---

## 13. Controle de versão e rollback

Cada pacote deverá conter uma versão clara e um registro das mudanças. As versões deverão distinguir:

| Tipo de mudança | Tratamento recomendado |
|---|---|
| Correção interna sem mudança de contrato | Incremento de patch. |
| Novo adaptador experimental | Incremento de versão menor ou identificador experimental. |
| Mudança de contrato aprovada | Incremento de versão maior ou decisão formal registrada. |
| Alteração excepcional de regra | Versão específica, changelog e autorização anexada. |

Antes de cada empacotamento deverá ser salvo:

- pacote anterior funcional;
- hash dos arquivos protegidos;
- lista de arquivos modificados;
- resultado dos testes;
- log da validação real;
- instruções de rollback;
- versão do adaptador;
- estado do manifesto e da CSP.

O rollback mínimo deverá permitir voltar ao pacote imediatamente anterior sem exigir reconstrução manual ou instalação de dependências adicionais.

---

## 14. Primeira expansão: Udemy

A Udemy será tratada como o primeiro adaptador externo, não como motivo para reescrever a S·IA.

A ordem obrigatória será:

1. congelar o caminho funcional do Coursera;
2. documentar a estrutura observada da Udemy sem interferência;
3. criar o `Udemy Adapter` isoladamente;
4. implementar a fonte principal de legenda;
5. implementar o fallback desde o primeiro protótipo;
6. implementar diagnóstico visível;
7. conectar os eventos ao núcleo existente;
8. testar voz nativa antes do Piper;
9. testar Piper e fallback;
10. repetir toda a regressão do Coursera;
11. empacotar como suporte experimental;
12. promover o suporte somente após os critérios de aceitação.

Nenhum código específico da Udemy deverá ser colocado dentro de funções do sincronizador ou do provedor neural apenas para acelerar a primeira prova de conceito.

O primeiro objetivo da Udemy será modesto e mensurável: **detectar corretamente a legenda ativa, informar a origem, encaminhar uma única cue ao núcleo comum e preservar o Coursera**.

---

## 15. Checklist obrigatório antes de qualquer entrega

Antes de entregar uma versão multiplataforma, a pessoa responsável deverá responder “sim” a todos os itens aplicáveis.

### Proteção do Coursera

- [ ] O caminho funcional do Coursera não foi substituído.
- [ ] O `sync-engine.js` conserva o hash esperado ou possui autorização formal para divergência.
- [ ] A voz nativa continua sendo o padrão.
- [ ] O Piper continua opcional e desligado por padrão.
- [ ] O fallback automático continua funcionando.
- [ ] As abas antigas e novas foram testadas.

### Núcleo único de áudio

- [ ] Não existe fila de áudio duplicada por plataforma.
- [ ] Não existe sincronizador duplicado por plataforma.
- [ ] Não existe bridge neural duplicado por plataforma.
- [ ] A pré-síntese usa o mesmo mecanismo comum.
- [ ] O cancelamento e o fallback são comuns.

### Nova plataforma

- [ ] O adaptador possui identificação e versão.
- [ ] O adaptador é isolado.
- [ ] O player e a fonte de legenda estão diagnosticados.
- [ ] A fonte principal foi testada.
- [ ] O fallback foi testado.
- [ ] As situações de player ausente e legenda ausente são compreensíveis.
- [ ] A troca de aula, pausa, busca e recarga foram testadas.

### Qualidade e entrega

- [ ] Os testes automatizados foram executados.
- [ ] A regressão do Coursera foi aprovada.
- [ ] O teste físico no navegador foi registrado.
- [ ] Não há erro crítico no console.
- [ ] O manifesto, permissões, CSP e recursos distribuídos foram verificados.
- [ ] O pacote possui versão correta.
- [ ] O rollback está documentado.
- [ ] Nenhuma exceção foi aplicada sem aprovação prévia explícita.

---

## 16. Registro de decisões

Toda decisão que afete a arquitetura deverá ser adicionada a esta seção ou a um registro vinculado ao documento.

| Data | ID | Decisão | Componentes afetados | Aprovação necessária | Estado |
|---|---|---|---|---:|---|
| 21/08/2026 | DM-001 | Expansão multiplataforma será feita por adaptadores isolados. | Arquitetura futura | Não, regra base | Aprovada como norma |
| 21/08/2026 | DM-002 | Coursera, núcleo de áudio, diagnóstico e fallback são protegidos. | Coursera e S·IA Core | Não, regra base | Aprovada como norma |
| 21/08/2026 | DM-003 | Udemy será a primeira plataforma adicional analisada. | Novo adaptador | Não, dentro deste documento | Planejada |

---

## 17. Declaração final de governança

A S·IA deverá crescer sem sacrificar aquilo que já funciona. A expansão multiplataforma não será conduzida por reescrita impulsiva, cópia de lógica ou alterações silenciosas. Ela será conduzida por isolamento, evidência, diagnóstico, testes e reversibilidade.

As três regras abaixo permanecem como compromisso permanente do projeto:

> **1. Nenhuma alteração no motor funcional atual do Coursera. O adaptador existente deve ser preservado e o novo suporte deve ser aditivo.**

> **2. Nenhuma cópia independente da lógica de áudio. Coursera e Udemy devem utilizar o mesmo núcleo de voz, fila, sincronização, Piper e fallback.**

> **3. Diagnóstico e fallback desde o primeiro protótipo. O usuário precisa saber se a S·IA está usando a fonte principal de legendas ou uma estratégia alternativa.**

Qualquer alteração dessas regras dependerá de hipóteses investigadas, evidências reproduzíveis, comparação mensurável, regressão completa e **aprovação prévia, explícita e específica do usuário**.

Enquanto essa aprovação não existir, as regras devem ser tratadas como inalteráveis.

---

## Referências internas

[1]: ./DIAGNOSTICO_ATRASO_NEURAL_SIA_1.8.5.md "Diagnóstico do atraso neural e validação da S·IA 1.8.5"

[2]: ./VALIDACAO_REAL_SIA_1.8.5.txt "Log de validação real da S·IA 1.8.5 no Chromium"

[3]: ./extracted/tts-extension/sync-engine.js "Motor de sincronização preservado da S·IA"

[4]: ./sia-extension-1.8.5-neural-sync-fix.zip "Pacote validado da S·IA 1.8.5"
