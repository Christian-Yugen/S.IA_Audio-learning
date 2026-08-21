# Segurança e divulgação responsável

## Relato de vulnerabilidades

Não publique em issue detalhes que possam expor tokens, cookies, sessões, dados pessoais, conteúdo privado de cursos ou caminhos locais do sistema. Remova esses dados antes de enviar qualquer diagnóstico.

Quando houver um canal privado oficial definido, utilize-o para vulnerabilidades. Enquanto esse canal não estiver definido, registre apenas uma descrição mínima e solicite orientação ao mantenedor sem anexar credenciais ou dados sensíveis.

## Escopo de segurança

O escopo inclui:

- exposição de dados armazenados localmente;
- execução de código não autorizado;
- permissões excessivas no manifesto;
- carregamento remoto inesperado;
- vazamento de legendas, notas ou histórico;
- manipulação indevida do player;
- adulteração do runtime neural;
- empacotamento de arquivos não autorizados;
- falsificação de atualizações ou releases.

## Não incluir em relatos

Não inclua senhas, tokens, cookies, headers de autenticação, perfis do Chrome, URLs privadas, dados de conta, vídeos de cursos, gravações de voz ou transcrições protegidas.

## Princípios de privacidade

A extensão deverá processar localmente, por padrão, legendas, configurações, histórico, favoritos e notas. Qualquer mudança nesse comportamento deverá ser documentada, revisada e aprovada antes da implementação.

## Dependências neurais

Alterações no runtime WebAssembly, nos pesos, nos arquivos de licença ou no carregamento do Worker devem passar por revisão de integridade e licenciamento. Um modelo sem origem ou autorização verificável não deve entrar em uma release pública.
