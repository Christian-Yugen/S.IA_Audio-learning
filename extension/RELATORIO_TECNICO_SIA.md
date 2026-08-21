# Relatório Técnico e de Produto — S·IA

**Produto:** S·IA | Audio-learning by UXBRAS®  
**Versão analisada:** 1.7.0  
**Plataforma:** extensão para Google Chrome, Manifest V3  
**Ambiente principal:** aulas em vídeo do Coursera  
**Data do relatório:** 23 de julho de 2026

---

## 1. Resumo executivo

A S·IA é uma extensão de navegador voltada ao aprendizado por áudio e à
acessibilidade em aulas do Coursera. Sua função central é identificar as legendas
nativas do vídeo, transformar o texto em fala e manter essa fala sincronizada com
o conteúdo exibido.

O produto não funciona como um leitor de tela genérico. Ele possui um motor
especializado no fluxo de legendas do player: reconhece frases, filtra elementos
que não pertencem ao diálogo, elimina sobreposições entre cues, respeita
pontuação, estima a duração da fala e adapta o ritmo da voz ou do vídeo.

A partir da versão 1.7.0, a S·IA também funciona como companheira de aprendizagem.
O usuário pode repetir frases, navegar pelo histórico da aula, salvar trechos,
escrever anotações e exportar seu material de estudo.

Todo o processamento atual é local. A S·IA não depende de servidor, conta externa,
API de IA, serviço pago ou transmissão de legendas para a UXBRAS®.

---

## 2. Problema que a S·IA resolve

Plataformas de ensino em vídeo dependem fortemente de informação visual. Para
muitos usuários, acompanhar simultaneamente o vídeo, a interface e as legendas
pode ser cansativo ou inviável.

A S·IA reduz essa dependência visual ao converter as legendas em áudio. Isso pode
apoiar:

- pessoas com baixa visão;
- usuários com dislexia ou dificuldade de leitura contínua;
- estudantes com TDAH ou oscilação de foco;
- aprendizagem em segundo idioma;
- estudo de aulas técnicas e densas;
- usuários que aprendem melhor por estímulo auditivo;
- situações em que não é possível acompanhar a tela continuamente.

O diferencial não está apenas em “ler texto”. O principal desafio solucionado é
ler as legendas no momento correto, sem pronunciar controles do player, sem
repetir palavras e sem transformar cada cue em uma frase artificialmente
encerrada.

---

## 3. Proposta de valor

A proposta de valor da S·IA pode ser resumida em quatro pilares:

1. **Ouvir:** transformar legendas em fala usando as vozes disponíveis no
   dispositivo.
2. **Sincronizar:** adaptar voz e vídeo para reduzir a diferença entre o que é
   mostrado e o que é pronunciado.
3. **Compreender:** permitir repetir imediatamente uma frase que não foi
   entendida.
4. **Revisar:** registrar, favoritar, anotar e exportar momentos importantes da
   aula.

---

## 4. Funcionalidades atuais

### 4.1 Leitura automática de legendas

A extensão monitora o vídeo ativo e identifica a legenda atual. Quando encontra
um texto válido, cria uma instância de `SpeechSynthesisUtterance` e a envia ao
sintetizador de voz do navegador.

O usuário pode configurar:

- voz;
- idioma;
- velocidade base entre 0.6x e 3.5x;
- tom entre 0.5 e 1.5;
- volume entre 0% e 100%;
- estratégia de sincronização;
- modo compacto do pop-up.

### 4.2 Isolamento do texto correto

A S·IA prioriza as faixas nativas `TextTrack` do vídeo. Essa fonte fornece as
`cues` de legenda sem misturar botões, barra de progresso ou relógio.

Quando uma `TextTrack` não está disponível, a extensão utiliza seletores DOM
específicos para containers de legenda. Nesse fallback, ela:

- exige que o elemento esteja visível;
- rejeita elementos dentro dos controles;
- elimina containers externos duplicados;
- normaliza espaços e caracteres invisíveis;
- exige quantidade mínima de letras;
- rejeita comandos como “play”, “pause”, “volume” e equivalentes;
- rejeita padrões de tempo como `0:14`, `2:21` e `0:14 / 2:21`.

### 4.3 Construção de sentenças

As plataformas de vídeo frequentemente dividem uma sentença em várias cues.
Pronunciar cada cue separadamente faz a voz encerrar artificialmente pequenos
blocos que, linguisticamente, ainda continuam.

A S·IA combina fragmentos consecutivos até encontrar:

- ponto final;
- interrogação;
- exclamação;
- reticências;
- limite preventivo de caracteres;
- limite preventivo de tempo.

Quando a faixa oferece cues futuras, o motor pode antecipar os próximos
fragmentos da mesma sentença. Isso permite iniciar a fala imediatamente com a
estrutura completa da frase, melhorando a prosódia.

### 4.4 Deduplicação e sobreposição

O Coursera pode publicar cues cumulativas ou parcialmente sobrepostas. Uma cue
pode terminar com:

> “um ponto de dados”

e a próxima começar com:

> “ou um ponto de dados que não faz sentido”

A S·IA compara palavras no final do texto anterior com palavras no início do
novo texto. A região repetida é removida e somente o conteúdo novo é
pronunciado.

A comparação considera:

- fala atual;
- fala já enfileirada;
- frase mantida como reserva;
- última fala concluída recentemente.

A referência temporária da última fala concluída resolve sobreposições que
aparecem logo depois de um ponto final, quando o estado da fala atual já foi
limpo.

### 4.5 Fila sem cortes abruptos

A S·IA utiliza a fila nativa de `speechSynthesis`. Uma nova frase é preparada
enquanto a anterior ainda está sendo pronunciada.

Durante transições normais, o sistema não usa `speechSynthesis.cancel()`. Isso
evita:

- palavras cortadas;
- reinícios no meio da frase;
- gagueira;
- repetição causada por microalterações da legenda.

Existe também uma reserva com a legenda válida mais recente para impedir o
acúmulo ilimitado de frases atrasadas.

### 4.6 Sincronização adaptativa contínua

O motor estima a duração da fala usando:

- número de palavras;
- pontuação;
- pausas estimadas;
- velocidade base;
- velocidade atual do vídeo;
- tempo restante das cues;
- comportamento observado da voz selecionada.

O cálculo também considera quando a nova fala provavelmente começará. Isso é
importante porque uma legenda pode ser detectada agora, mas permanecer aguardando
outra frase terminar.

A taxa adaptativa:

- desconta o atraso estimado da fila;
- calcula a taxa necessária para o tempo realmente disponível;
- limita a correção a aproximadamente 0.3x por frase;
- respeita o máximo de 3.5x;
- reduz a correção gradualmente quando o atraso desaparece;
- aprende um fator de duração da voz com base nas falas concluídas.

Essa calibração é local e matemática. A versão atual não utiliza modelo de
machine learning ou IA generativa.

### 4.7 Desaceleração temporária do vídeo

Quando o usuário seleciona “Desacelerar vídeo temporariamente”, a S·IA estima se
a frase poderá ser concluída dentro do intervalo disponível.

Quando necessário, ela reduz temporariamente `video.playbackRate`. Ao terminar a
fala, restaura a velocidade original.

Se o usuário mudar manualmente a velocidade durante o ajuste, essa escolha passa
a ter prioridade. A extensão evita sobrescrever a decisão manual.

### 4.8 Status em tempo real

O pop-up consulta o `content.js` e informa estados como:

- vídeo não encontrado;
- vídeo pausado;
- aula finalizada;
- aguardando pontuação;
- leitura ativa;
- voz adaptada;
- vídeo temporariamente desacelerado;
- atraso estimado da fila;
- erro ou bloqueio do sintetizador.

### 4.9 S·IA Recall

O Recall permite repetir a última frase por:

- botão no pop-up;
- botão no Companion;
- clique em uma frase do histórico;
- atalho `Alt + Shift + R`.

Ao repetir, a extensão:

1. encontra o intervalo original da frase;
2. interrompe a reprodução atual por uma ação explícita do usuário;
3. reposiciona o vídeo no início da frase;
4. limpa o estado de detecção necessário;
5. reinicia o vídeo;
6. permite que o motor validado leia novamente o trecho.

O Recall reutiliza o mesmo motor de sincronização. Não existe um segundo leitor
com regras diferentes.

### 4.10 S·IA Companion

O Companion é uma interface persistente no painel lateral nativo do Chrome. Ele
permanece ao lado da aula e apresenta:

- frase atual;
- histórico recente;
- timestamp de cada frase;
- repetição de frases antigas;
- favoritos;
- anotações;
- filtro de trechos salvos;
- exportação em Markdown;
- limpeza controlada do histórico.

### 4.11 Perfis por curso

Voz, idioma, velocidade, tom, volume e estratégia de sincronização podem ser
memorizados por curso.

Quando o usuário retorna ao curso, a S·IA aplica o perfil correspondente. Isso
permite, por exemplo, utilizar ritmos diferentes em um curso técnico e em um
curso de idioma.

---

## 5. Tecnologias utilizadas

### 5.1 Chrome Extensions — Manifest V3

O projeto utiliza a arquitetura atual de extensões do Chrome:

- `manifest.json`;
- content scripts;
- service worker;
- action pop-up;
- Side Panel API;
- Commands API;
- Storage API;
- mensageria com `chrome.runtime` e `chrome.tabs`.

### 5.2 JavaScript

Todo o código funcional é escrito em JavaScript nativo, sem framework e sem
dependências externas de execução.

São utilizados:

- funções assíncronas;
- Promises;
- eventos DOM;
- expressões regulares Unicode;
- arrays e objetos imutáveis;
- temporizadores;
- comunicação entre contextos da extensão;
- APIs de mídia e fala do navegador.

### 5.3 HTML e CSS

O pop-up e o Companion utilizam:

- HTML semântico;
- componentes acessíveis;
- `aria-live`;
- `role="status"`;
- labels vinculados aos controles;
- CSS Grid e Flexbox;
- variáveis CSS;
- tema escuro;
- estados de foco, seleção e desativação;
- tipografia nativa do sistema.

### 5.4 Web Speech API

As principais interfaces são:

- `window.speechSynthesis`;
- `SpeechSynthesisUtterance`;
- `speechSynthesis.getVoices()`;
- eventos `onstart`, `onend` e `onerror`.

As vozes são fornecidas pelo navegador ou sistema operacional. A S·IA não envia
o texto a uma API contratada pela UXBRAS®.

### 5.5 HTMLMediaElement e TextTrack API

O motor interage com:

- elemento `<video>`;
- `currentTime`;
- `paused`;
- `ended`;
- `playbackRate`;
- `textTracks`;
- `activeCues`;
- `track.cues`;
- `startTime` e `endTime` das cues.

Essas APIs permitem identificar o texto e relacioná-lo ao tempo do vídeo.

### 5.6 DOM API

O fallback de legendas utiliza:

- `querySelector` e `querySelectorAll`;
- `closest`;
- `getComputedStyle`;
- `getBoundingClientRect`;
- `innerText` e `textContent`;
- análise de visibilidade;
- exclusão de regiões de controle.

### 5.7 Chrome Storage API

`chrome.storage.local` armazena:

- configurações globais;
- perfis por curso;
- histórico por aula;
- favoritos;
- anotações;
- preferência de modo compacto.

O armazenamento permanece no navegador e é apagado quando a extensão é
removida.

### 5.8 Chrome Side Panel API

O arquivo `sidepanel.html` é declarado como painel lateral da extensão. O pop-up
pode solicitar sua abertura em resposta ao clique do usuário.

### 5.9 Chrome Commands API

O manifesto registra o comando `replay-last-sentence`, associado por padrão a
`Alt + Shift + R`.

O service worker recebe o comando, localiza a aba ativa e encaminha
`SIA_REPLAY_LAST` ao content script.

### 5.10 Node.js para testes

O motor matemático foi estruturado para também funcionar como módulo CommonJS.
Isso permite testar funções puras com:

- `node:test`;
- `node:assert/strict`.

### 5.11 PowerShell para empacotamento

O script `scripts/package-extension.ps1`:

1. lê a versão do manifesto;
2. cria uma área temporária;
3. copia somente os arquivos permitidos;
4. inclui ícones e componentes da extensão;
5. gera o ZIP final;
6. remove os arquivos temporários.

O uso de uma allowlist reduz o risco de publicar arquivos internos por engano.

---

## 6. Arquitetura

```text
┌─────────────────────────────────────────────────────────────┐
│                         Coursera                            │
│  vídeo + TextTracks + containers DOM de legenda            │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ content.js                                                  │
│                                                             │
│ detecção → validação → montagem → deduplicação → fila TTS   │
│                         │                  │                 │
│                         ▼                  ▼                 │
│                  sync-engine.js      histórico local        │
│                         │                  │                 │
│                         ▼                  ▼                 │
│                  speechSynthesis    chrome.storage.local    │
└───────────────┬─────────────────────┬───────────────────────┘
                │ mensagens           │ mensagens
        ┌───────▼────────┐     ┌──────▼─────────────┐
        │ popup.html/js  │     │ sidepanel.html/js  │
        │ configurações  │     │ S·IA Companion     │
        └────────────────┘     └────────────────────┘
                ▲
                │
        ┌───────┴─────────────┐
        │ service-worker.js   │
        │ atalhos do Chrome   │
        └─────────────────────┘
```

---

## 7. Responsabilidade dos arquivos

### `manifest.json`

Declara identidade, versão, permissões, ícones, pop-up, service worker, painel
lateral, atalhos e injeção dos content scripts no Coursera.

### `content.js`

É o principal controlador de execução na aula. Responsável por:

- localizar vídeo e legendas;
- controlar estado;
- falar;
- sincronizar;
- ajustar o vídeo;
- registrar histórico;
- executar Recall;
- responder mensagens.

### `sync-engine.js`

Contém regras matemáticas e linguísticas puras:

- estimativa de duração;
- reconhecimento de pontuação final;
- preparação prosódica;
- remoção de sobreposição;
- cálculo de velocidade;
- sincronização contínua.

### `popup.html`, `popup.css`, `popup.js`

Formam o painel rápido da extensão:

- ativação;
- voz e idioma;
- áudio;
- sincronização;
- status;
- Recall;
- abertura do Companion;
- perfis por curso.

### `sidepanel.html`, `sidepanel.css`, `sidepanel.js`

Formam o S·IA Companion:

- histórico;
- frase atual;
- Recall;
- favoritos;
- notas;
- exportação;
- limpeza.

### `service-worker.js`

Escuta comandos globais da extensão e encaminha ações para a aba ativa.

### `tests/sync-engine.test.js`

Protege o comportamento do motor de sincronização e deduplicação.

### `scripts/package-extension.ps1`

Produz o arquivo instalável para testes e publicação.

---

## 8. Fluxo completo de leitura

1. O content script é carregado em uma página do Coursera.
2. As configurações globais e o perfil do curso são recuperados.
3. Um monitor verifica periodicamente o vídeo.
4. Se o vídeo estiver pausado, a síntese e ajustes temporários são encerrados.
5. A S·IA tenta obter a legenda pela `TextTrack`.
6. Se necessário, usa o DOM como fallback.
7. O texto passa pelo filtro contra temporizadores e controles.
8. Fragmentos relacionados são combinados.
9. Sobreposições com falas anteriores são removidas.
10. A duração e o início previsto da fila são estimados.
11. A taxa de fala ou velocidade do vídeo é calculada.
12. A utterance é configurada com voz, idioma, taxa, pitch e volume.
13. A fala entra na fila nativa.
14. No início real, a frase é registrada no histórico.
15. No término, o motor calibra a duração observada da voz.
16. A próxima frase começa sem cancelamento abrupto.

---

## 9. Comunicação interna

Os componentes utilizam mensagens com tipos explícitos:

- `SIA_CONFIG_UPDATE`;
- `SIA_GET_STATUS`;
- `SIA_GET_LEARNING_CONTEXT`;
- `SIA_REPLAY_LAST`;
- `SIA_UPDATE_HISTORY_ENTRY`;
- `SIA_CLEAR_HISTORY`.

Essa separação permite que pop-up, painel lateral e service worker controlem a
aula sem acessar diretamente as variáveis internas do leitor.

---

## 10. Modelo de dados local

### Configurações

```json
{
  "sia_enabled": true,
  "sia_voice": "",
  "sia_lang": "pt-BR",
  "sia_speed": 1.2,
  "sia_pitch": 1,
  "sia_volume": 100,
  "sia_sync": "accelerate_voice",
  "sia_compact": false
}
```

### Perfil por curso

```json
{
  "sia_course_profiles": {
    "data-analytics-introduction": {
      "sia_voice": "Google português do Brasil",
      "sia_speed": 1,
      "sia_sync": "slow_video"
    }
  }
}
```

### Entrada do histórico

```json
{
  "id": "timestamp-identificador",
  "texto": "Texto pronunciado pela S·IA.",
  "inicio": 214.75,
  "fim": 220.48,
  "url": "https://www.coursera.org/...",
  "titulo": "Título da aula",
  "curso": "data-analytics-introduction",
  "criadoEm": 1784840000000,
  "favorito": true,
  "nota": "Revisar este conceito."
}
```

---

## 11. Privacidade e segurança

### Processamento local

Na versão 1.7.0:

- legendas não são enviadas para a UXBRAS®;
- não existe backend;
- não existe conta;
- não existe analytics;
- não existe publicidade;
- não existe código remoto;
- não existe integração com modelo de IA externo.

### Permissões

- `activeTab`: comunicação com a aba ativa após interação do usuário;
- `storage`: configurações, perfis, histórico, favoritos e notas;
- `sidePanel`: interface persistente do Companion;
- acesso a `https://*.coursera.org/*`: detecção do player e das legendas.

### Princípio de minimização

A extensão atua apenas nas páginas compatíveis do Coursera e usa permissões
diretamente relacionadas ao seu propósito.

---

## 12. Custos operacionais

As funcionalidades atuais utilizam recursos nativos do navegador. Portanto, não
geram cobrança por frase, minuto, histórico, favorito ou anotação.

Podem existir custos administrativos externos ao código:

- registro de desenvolvedor na Chrome Web Store;
- domínio;
- e-mail profissional;
- hospedagem da política de privacidade e site institucional.

Custos recorrentes de produto só surgirão se forem adicionados:

- IA generativa;
- tradução por API;
- voz neural paga;
- autenticação;
- sincronização em nuvem;
- banco de dados;
- analytics ou suporte automatizado.

---

## 13. Qualidade e testes

O motor possui 15 testes automatizados cobrindo:

- duração mínima;
- efeito de palavras e pontuação;
- encerramento por pontuação;
- continuação prosódica;
- sobreposição entre cues;
- descarte de cue repetida;
- sobreposição após ponto final;
- distribuição temporal;
- aumento gradual de taxa;
- redução gradual da correção;
- calibração de voz lenta;
- manutenção da taxa base;
- limite máximo de aceleração;
- desaceleração mínima do vídeo;
- preservação de velocidade personalizada.

Além dos testes automatizados, o desenvolvimento utilizou:

- validação de sintaxe com `node --check`;
- validação do manifesto;
- `git diff --check`;
- conferência da allowlist do ZIP;
- testes manuais em aulas reais do Coursera.

---

## 14. Princípios que não devem regredir

As versões futuras devem preservar:

1. nenhuma leitura de temporizadores ou controles;
2. nenhuma repetição de sobreposição já conhecida;
3. nenhuma interrupção agressiva em transições normais;
4. respeito à pontuação;
5. continuidade natural;
6. limite de velocidade configurado;
7. restauração da velocidade do vídeo;
8. prioridade para alterações manuais do usuário;
9. processamento local por padrão;
10. compatibilidade com Recall e Companion;
11. ausência de perda silenciosa de texto;
12. acessibilidade dos controles.

---

## 15. Limitações atuais

- Compatibilidade direcionada ao Coursera.
- Dependência da qualidade das legendas disponibilizadas pela plataforma.
- Vozes variam conforme sistema operacional e navegador.
- O histórico é local e não sincroniza entre computadores.
- A versão atual não traduz nem explica o conteúdo.
- Não existe conta de usuário.
- Não existe backup automático em nuvem.
- Mudanças estruturais no player do Coursera podem exigir atualização de
  seletores.
- O histórico gratuito ainda deve receber política global de retenção para muitos
  cursos.
- Testes automatizados do Companion, Recall e armazenamento ainda devem ser
  ampliados.

---

## 16. Evolução recomendada

### 1.7.1 — Estabilidade do Companion

- testes de Recall, histórico, mensagens e armazenamento;
- gravação em lote;
- limite global de aulas armazenadas;
- preservação especial de favoritos;
- atualização atômica de perfis;
- tratamento de múltiplas abas.

### 1.8.0 — Experiência profissional

- editor de notas integrado;
- notificações visuais próprias;
- frase atual destacada;
- onboarding;
- gerenciamento de perfis;
- pesquisa local;
- backup e importação;
- acessibilidade ampliada.

### Versão premium futura

Possibilidades:

- explicar um trecho;
- traduzir;
- definir termos;
- gerar exemplos;
- criar perguntas de revisão;
- gerar resumos;
- sincronizar dados entre dispositivos;
- utilizar vozes neurais premium.

A camada premium deve ser opcional. A leitura, a sincronização e os recursos
essenciais locais devem continuar úteis sem assinatura.

---

## 17. Conclusão

A S·IA evoluiu de um leitor experimental de legendas para uma plataforma local de
audio-learning. Sua tecnologia combina análise de DOM, faixas de legenda,
síntese de voz, modelagem temporal, controle de mídia, armazenamento local e
interfaces nativas do Chrome.

Seu principal ativo técnico é o conjunto de regras que produz leitura contínua,
deduplicada e sincronizada. Seu principal ativo de produto é permitir que o
usuário ouça, recupere e registre o conteúdo da aula sem sair do ambiente de
aprendizagem.

A versão atual demonstra que a proposta pode entregar valor real sem
infraestrutura paga. A evolução premium poderá adicionar inteligência em nuvem,
mas deverá ser construída sobre os princípios de harmonia, privacidade e controle
do usuário consolidados na base gratuita.

