# Pipeline de tradução EN → PT-BR

## Objetivo

A tradução é uma camada comum do núcleo S·IA. Ela recebe apenas legendas que já passaram pelas garantias temporais dos adaptadores e entrega texto em português à fila compartilhada de voz.

```text
adaptador → cue segura → tradução local → sincronização → voz → Companion
```

## Provedor inicial

O primeiro provedor usa a `Translator API` do Chrome com o par `en` → `pt`. O modelo é administrado pelo navegador e pode ser baixado no primeiro uso. Nenhuma chave de API ou backend é necessário.

A funcionalidade é opt-in e mantém compatibilidade degradada:

- opção desligada: comportamento 1.8.41 inalterado;
- API/modelo disponível: traduz e lê em PT-BR;
- API/modelo indisponível: registra diagnóstico e lê o original;
- seek, troca de aula ou desativação: descarta resultados assíncronos obsoletos.

## Invariantes

- adaptadores não traduzem nem controlam áudio;
- `sync-engine.js` permanece inalterado;
- a fila de fala continua responsável pela ordem de reprodução;
- o tradutor é aquecido ao ativar a opção e até quatro cues futuras são pré-traduzidas;
- requisições independentes podem executar sem bloqueio global e pedidos iguais compartilham a mesma Promise;
- cache em memória evita trabalho repetido e é limitado a 300 entradas;
- histórico conserva texto traduzido e original;
- nenhum texto é enviado a serviço externo.
