# Ficha da Chrome Web Store — S·IA

## Identidade

**Nome**

S·IA | Audio-learning da UXBRAS®

**Resumo curto**

Transforme legendas de aulas do Coursera em áudio com voz, velocidade e
sincronização adaptativas.

**Idioma principal**

Português (Brasil)

**Categoria sugerida**

Acessibilidade

## Descrição detalhada

S·IA transforma as legendas das aulas do Coursera em áudio para apoiar
acessibilidade, foco e aprendizado auditivo.

A extensão detecta as legendas ativas do player e utiliza as vozes instaladas no
próprio dispositivo para pronunciá-las em tempo real. Todo o processamento ocorre
localmente no navegador.

Principais recursos:

- leitura automática das legendas exibidas no vídeo;
- seleção de voz e idioma;
- velocidade ajustável de 0.6x a 3.5x;
- controles de tom e volume;
- sincronização adaptativa por velocidade de voz;
- desaceleração temporária e reversível do vídeo;
- transições naturais entre frases, sem cortes bruscos;
- modo compacto e status da aula em tempo real;
- preferências salvas localmente.

A S·IA funciona exclusivamente nas páginas compatíveis do Coursera. A extensão
não envia legendas, histórico ou preferências para servidores externos e não
utiliza anúncios ou rastreamento.

Powered by UXBRAS®.

## Propósito único

Converter em voz, localmente no navegador, as legendas exibidas em aulas do
Coursera e sincronizar a reprodução para apoiar o aprendizado por áudio.

## Justificativas de permissões

### `storage`

Necessária para salvar localmente as preferências escolhidas pelo usuário, como
voz, idioma, velocidade, tom, volume, estratégia de sincronização e modo compacto.

### `activeTab`

Usada somente quando o usuário abre o pop-up para identificar a aba ativa,
consultar o estado do vídeo e aplicar imediatamente as alterações de configuração
ao leitor da página.

### Acesso a `https://*.coursera.org/*`

Restrito ao Coursera para detectar o player, ler a legenda ativa e ajustar
temporariamente a velocidade do vídeo quando essa estratégia for selecionada.

## Código remoto

**Declaração:** não utiliza código remoto.

Todo JavaScript executável está incluído no pacote da extensão. Nenhum script é
baixado, interpretado ou executado a partir de servidores externos.

## Práticas de dados

- Conteúdo de sites: as legendas visíveis são processadas localmente apenas para
  gerar a fala solicitada pelo usuário.
- Preferências: armazenadas somente em `chrome.storage.local`.
- Transmissão externa: nenhuma.
- Compartilhamento ou venda: nenhum.
- Publicidade e analytics: não utilizados.
- Interação humana com dados: nenhuma.

## Instruções para revisão

1. Instale a extensão e abra uma aula com vídeo no Coursera.
2. Ative as legendas nativas no player.
3. Inicie o vídeo.
4. Abra o pop-up da S·IA e confirme o status “Conectada”.
5. Altere voz, velocidade, tom ou volume e verifique a aplicação na próxima fala.
6. Teste as estratégias “Ajustar velocidade da voz” e “Desacelerar vídeo
   temporariamente”.
7. Pause o vídeo e confirme que a fala e qualquer ajuste temporário são
   interrompidos/restaurados.

Não são necessárias credenciais fornecidas pelo desenvolvedor. O revisor pode
usar uma conta própria do Coursera e qualquer aula com legendas disponíveis.

## Recursos gráficos necessários

- Ícone da loja: PNG 128x128, conteúdo central de 96x96 com margem transparente.
- Screenshot obrigatório: 1280x800 ou 640x400, sem padding.
- Screenshot recomendado 1: pop-up completo e status conectado.
- Screenshot recomendado 2: modo compacto.
- Screenshot recomendado 3: estratégia adaptativa em funcionamento.
- Imagem promocional pequena obrigatória: PNG ou JPEG 440x280.
- Imagem marquee opcional: PNG ou JPEG 1400x560.

## Campos pendentes

- URL pública da política de privacidade.
- E-mail oficial de suporte da UXBRAS®.
- URL oficial/verificada da marca, se disponível.
- Capturas de tela e imagem promocional final.
