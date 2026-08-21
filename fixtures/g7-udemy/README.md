# Fixture Chromium do Gate G7

Esta fixture simula uma aula Udemy sob HTTPS local, com o host resolvido para `127.0.0.1`. Ela cria o vídeo e a legenda DOM depois do carregamento inicial para testar reconexão do adaptador.

## Execução local

No diretório desta fixture, gere um certificado temporário com nome alternativo `www.udemy.com`:

```bash
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout key.pem -out cert.pem -days 1 \
  -subj '/CN=www.udemy.com' \
  -addext 'subjectAltName=DNS:www.udemy.com'
```

Inicie o servidor:

```bash
node server.js
```

Em outro terminal, carregue a extensão com Chromium headless e faça o mapeamento do host:

```bash
chromium --headless=new --no-sandbox --disable-gpu \
  --ignore-certificate-errors \
  --host-resolver-rules='MAP www.udemy.com 127.0.0.1' \
  --load-extension=/caminho/para/extension \
  --virtual-time-budget=3500 \
  --dump-dom \
  'https://www.udemy.com:8777/course/test/learn/lecture/4242'
```

O resultado esperado é `player: "found"`, `source: "dom-caption"`, `confidence: "low"`, `state: "UNSAFE_TO_SPEAK"` e `safeToSpeak: false`. A fixture não contém áudio, login ou conteúdo real da Udemy.
