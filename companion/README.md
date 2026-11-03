# S·IA — Whisper local (piloto 1.13.0)

O Whisper substitui somente a fonte ausente de legendas. A tradução, a voz, o histórico e o sincronizador continuam sendo os existentes. O modo atende vídeos gravados do YouTube com fala em inglês ou português. Não atende lives nesta versão.

## Windows

1. Instale Python 3.11 e FFmpeg; ambos devem estar no PATH (`python --version` e `ffmpeg -version`).
2. Abra `companion/start-windows.cmd`. O script cria um ambiente Python isolado, instala Whisper e yt-dlp e abre o serviço. O primeiro uso baixa o modelo `base`.
3. Mantenha a janela aberta e copie a chave da sessão exibida nela.
4. Carregue a pasta `extension` no Chrome. Desative a cópia antiga e recarregue o vídeo.
5. Ligue a S·IA para YouTube. No popup, abra **Vídeo sem legendas · Whisper local**, informe a chave e clique **Usar Whisper neste vídeo**. Para inglês, mantenha habilitada a tradução para português nos controles existentes.
6. Aguarde a preparação. A extensão pausa a reprodução quando falta transcrição e retoma a pausa feita por ela quando o bloco está pronto. Use **Parar Whisper** para encerrar.

Linux/macOS: crie um ambiente Python, instale `requirements.txt` e execute `python server.py --model base`, com FFmpeg instalado.

## Escopo e limites

- Piloto opt-in: após configurar e iniciar pela primeira vez, a opção **Usar automaticamente quando não houver legenda utilizável** fica marcada por padrão. Pode ser desmarcada. O serviço deve continuar aberto; a chave dura somente a sessão do Chrome. A extensão aguarda pelo menos 10 segundos antes da primeira tentativa automática, para dar tempo de recuperar legendas existentes. Não substitui legendas já utilizáveis.
- Blocos de 30 segundos; preparação seguinte começa quando restam cerca de 12 segundos de transcrição. Não há promessa de latência ou de execução mais rápida que o vídeo.
- Transcrição local; o áudio é obtido do YouTube pelo yt-dlp e processado pelo FFmpeg. Não é enviado a um serviço remoto de reconhecimento. O tradutor já existente mantém suas próprias conexões e condições de privacidade.
- Sem acesso autenticado/cookies do navegador neste piloto. Vídeos restritos, bloqueios do YouTube e mudanças de extração podem impedir o acesso. A extensão informa falha e libera o original.
- Reconhecimento pode errar ou inventar texto, sobretudo em silêncio/música. Há filtro básico de probabilidade de silêncio; não é garantia de precisão. Frases na borda entre blocos podem ser cortadas; continuidade entre janelas requer avaliação antes de uso estável.
- Serviço vinculado exclusivamente a 127.0.0.1:8765, chave aleatória por execução, sem CORS aberto e sem aceitar URLs arbitrárias. Chave mantida somente na sessão do Chrome. Fechar o terminal encerra o serviço.
- Modelos e dependências exigem download inicial e espaço em disco. Desempenho depende do computador; processamento nesta versão usa o caminho CPU do Whisper.

## Testes

`python -m unittest discover -s companion -p test_server.py -v`

`node --test --test-concurrency=1 extension/tests/*.test.js extension/platform-adapters/test/*.test.js`

`python -m unittest discover -s extension/tests -p test_packaging.py -v`

Os testes do serviço usam um modelo simulado para verificar a orquestração. Eles não substituem a inferência real e a escuta no Chrome.
