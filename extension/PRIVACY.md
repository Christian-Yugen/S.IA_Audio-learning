# Política de privacidade da S·IA

Última atualização: 25 de agosto de 2026.

## Propósito

A S·IA transforma em voz as legendas exibidas em aulas compatíveis do Coursera e da Udemy e, de forma experimental, em páginas YouTube ativadas explicitamente pelo usuário. O objetivo é apoiar acessibilidade, foco e aprendizado por áudio.

## Dados processados

A extensão acessa o estado do player e as legendas temporais da página compatível. No Coursera e na Udemy, o comportamento automático existente é preservado. No YouTube, o bootstrap é carregado em páginas `/watch`, mas o adapter e o núcleo de áudio só são injetados depois de o usuário selecionar **YouTube** no popup.

Quando disponíveis, as captions YouTube são recuperadas localmente pelo bridge a partir do endpoint same-origin do próprio vídeo. Somente cues com texto, `startTime`, `endTime` e confiança alta podem seguir para a leitura automática. Texto visual sem temporização confirmada não é lido automaticamente.

Todo o processamento de voz ocorre localmente no navegador, usando a voz nativa ou o runtime Piper local já incluído na extensão. Não há servidor de inferência da S·IA nesse fluxo.

## Armazenamento

As preferências de voz, idioma, velocidade, tom, volume, sincronização e interface, os perfis configurados por curso e o histórico recente de frases são armazenados localmente com `chrome.storage.local`. A escolha de plataforma fixada para um domínio também usa `chrome.storage.local`. Uma escolha limitada à aba usa `chrome.storage.session` e é removida quando a aba deixa de existir.

O Companion inclui um MVP opcional de aprendizagem ativa. Quando o usuário cria uma marcação, a extensão guarda localmente somente o trecho temporal seguro da legenda, a URL/título identificadores da aula, o intervalo confirmado, o tipo de marcação, a pergunta e os metadados de revisão do cartão. A resposta digitada pelo estudante e a última avaliação também ficam em `chrome.storage.local`; não são transmitidas, sincronizadas com servidor ou usadas para diagnosticar capacidade. O fluxo pode ser apagado pelo controle de limpeza do estudo no Companion.

Trechos favoritos e anotações criadas pelo próprio usuário também permanecem somente no dispositivo. A remoção da extensão apaga esses dados conforme o comportamento de armazenamento do Chrome.

## Compartilhamento e transmissão

A S·IA não envia legendas, histórico de navegação, preferências ou dados de voz para servidores externos. O acesso same-origin do YouTube serve apenas para recuperar as captions do vídeo ativado e não é uma chamada de inferência ou um serviço de terceiros da S·IA. A extensão não vende nem compartilha dados pessoais.

## Permissões

| Permissão ou acesso | Justificativa |
|---|---|
| `storage` | Salvar preferências, perfis, histórico local e seleção de plataforma por domínio/aba. |
| `activeTab` | Identificar a aba ativa quando o usuário abre o popup, consultar o estado do vídeo e aplicar configurações. |
| `sidePanel` | Exibir o S·IA Companion com histórico, favoritos, anotações e controles locais. |
| `offscreen` | Executar o Worker Piper local em contexto offscreen, sem criar um motor neural por plataforma. |
| `scripting` | Injetar sob demanda o adapter YouTube somente depois de uma seleção compatível; não é usado para ativação automática irrestrita. |
| `https://*.coursera.org/*` | Detectar o vídeo e as legendas nas páginas compatíveis do Coursera. |
| `https://*.youtube.com/*` e `https://youtube.com/*` | Disponibilizar o bootstrap e a injeção programática restrita ao fluxo YouTube `/watch`, sempre condicionada ao gate de seleção. |

O caminho Udemy continua declarado pelos content scripts específicos existentes da extensão. Nenhuma permissão autoriza acesso a contas, credenciais ou conteúdo fora das páginas necessárias ao propósito único.

## Código remoto

**Declaração:** não utiliza código JavaScript remoto.

Todo JavaScript executável, o parser, o adapter, o runtime WebAssembly e o Worker neural usados pela extensão estão incluídos no pacote. O bridge YouTube lê captions same-origin do vídeo atual, mas não baixa nem executa código remoto.

## Contato

Antes da publicação, substitua esta seção por um endereço de suporte monitorado pela UXBRAS®.
