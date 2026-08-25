# Ficha de loja — S·IA | Audio-learning da UXBRAS®

## Identidade

**Nome**

S·IA | Audio-learning da UXBRAS®

**Resumo curto**

Transforme legendas de aulas do Coursera e da Udemy em áudio; ative o YouTube manualmente quando quiser testar o adaptador experimental.

**Idioma principal**

Português (Brasil)

**Categoria sugerida**

Acessibilidade

## Descrição detalhada

A S·IA transforma legendas de aulas do Coursera e da Udemy em áudio para apoiar acessibilidade, foco e aprendizado auditivo. O caminho atual dessas plataformas permanece automático e usa o mesmo núcleo local de voz, fila, sincronização, Piper opcional e fallback nativo.

No YouTube, a extensão não inicia o adapter sozinha. Em uma página HTTPS `/watch?v=...`, o usuário escolhe **YouTube** no popup e aplica a seleção à aba ou ao domínio. O seletor valida a URL, bloqueia Shorts e páginas incompatíveis, mostra o diagnóstico e permite desligar o adapter novamente.

A extensão detecta captions temporais e utiliza as vozes instaladas no próprio dispositivo ou o runtime neural local incluído no pacote. Todo o processamento de fala ocorre localmente no navegador. Captions YouTube são recuperadas same-origin somente para a página ativada; não existe inferência remota da S·IA.

Principais recursos:

- leitura automática das legendas exibidas em páginas compatíveis;
- seleção de voz e idioma;
- velocidade ajustável de 0.6x a 3.5x;
- controles de tom e volume;
- sincronização adaptativa por velocidade de voz;
- desaceleração temporária e reversível do vídeo;
- transições naturais entre frases, sem cortes bruscos;
- modo compacto e status da aula em tempo real;
- diagnóstico de fonte, confiança e estado;
- seleção de plataforma por aba ou domínio no fluxo YouTube;
- preferências salvas localmente.

O YouTube é uma integração **experimental e opt-in**. A extensão não declara que todas as variantes de player, captions ou vídeos da plataforma sejam compatíveis. A S·IA não utiliza anúncios ou rastreamento.

Powered by UXBRAS®.

## Propósito único

Converter localmente no navegador as legendas temporais exibidas em aulas do Coursera e da Udemy e, quando o usuário escolher explicitamente o modo YouTube em uma página compatível, encaminhá-las ao mesmo núcleo de leitura por áudio para apoiar acessibilidade e aprendizado.

## Justificativas de permissões

### `storage`

Necessária para salvar localmente preferências de voz, idioma, velocidade, tom, volume, sincronização, modo compacto, perfis, histórico e a escolha de plataforma fixada para um domínio.

### `activeTab`

Usada quando o usuário abre o popup para identificar a aba ativa, consultar o estado do vídeo e aplicar imediatamente configurações ou a seleção de plataforma.

### `sidePanel`

Exibe o S·IA Companion com histórico local, favoritos, anotações e controles de repetição da aula.

### `offscreen`

Permite executar o Worker Piper local em um contexto offscreen da extensão. O YouTube não possui Worker Piper, fila ou AudioContext próprio; ele reutiliza esse núcleo comum.

### `scripting`

Usada pelo service worker para injetar sob demanda o parser/bridge YouTube no mundo MAIN e o host/núcleo compartilhado no mundo ISOLATED, somente depois de uma seleção compatível feita pelo usuário.

### Acesso a `https://*.coursera.org/*`

Restrito ao Coursera para detectar o player, ler legendas e aplicar a sincronização já validada.

### Acesso a `https://*.youtube.com/*` e `https://youtube.com/*`

Restrito ao bootstrap e à injeção programática do fluxo YouTube. A página recebe somente o bootstrap enquanto o modo estiver desligado; o adapter é carregado apenas em páginas `/watch` aceitas pelo gate.

## Código remoto

**Declaração:** não utiliza código JavaScript remoto.

Todo JavaScript executável, o parser, os adapters, o Worker neural e o runtime WebAssembly estão incluídos no pacote da extensão. O bridge YouTube pode solicitar as captions same-origin do vídeo atual, mas não baixa nem executa código JavaScript de servidores externos.

## Práticas de dados

| Categoria | Prática |
|---|---|
| Conteúdo de sites | Captions temporais são processadas localmente apenas para gerar a fala solicitada. |
| Preferências | Armazenadas somente no armazenamento local/sessão do Chrome. |
| Transmissão externa | Nenhuma chamada para inferência remota ou servidor próprio. |
| Compartilhamento ou venda | Nenhum. |
| Publicidade e analytics | Não utilizados. |
| Interação humana com dados | Nenhuma. |

## Instruções para revisão

1. Instale a extensão e abra uma aula com vídeo no Coursera ou uma lecture compatível da Udemy.
2. Ative as legendas nativas no player e confirme o status da S·IA no popup.
3. Altere voz, velocidade, tom ou volume e verifique a aplicação na próxima fala.
4. Em uma página YouTube `/watch?v=...`, abra o popup, confirme que o estado inicial está desligado, selecione **YouTube** e clique em **Aplicar nesta aba**.
5. Confirme o diagnóstico do player e teste **Desativado nesta página** para verificar o rollback.
6. Verifique que uma página Shorts ou um domínio incompatível não ativa o adapter.

Não são necessárias credenciais fornecidas pelo desenvolvedor. O revisor pode usar uma conta própria e conteúdo de teste compatível.

## Recursos gráficos necessários

- Ícone da loja: PNG 128x128, conteúdo central de 96x96 com margem transparente.
- Screenshot obrigatório: 1280x800 ou 640x400, sem padding.
- Screenshot recomendado 1: popup no Coursera com status conectado.
- Screenshot recomendado 2: popup com YouTube desligado e diagnóstico de opt-in.
- Screenshot recomendado 3: popup com YouTube selecionado e diagnóstico ativo.
- Imagem promocional pequena obrigatória: PNG ou JPEG 440x280.
- Imagem marquee opcional: PNG ou JPEG 1400x560.

## Campos pendentes

- URL pública da política de privacidade.
- E-mail oficial de suporte da UXBRAS®.
- URL oficial/verificada da marca, se disponível.
- Capturas de tela e imagem promocional final.
- Auditoria formal da redistribuição comercial dos pesos e runtimes neurais.
