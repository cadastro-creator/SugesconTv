# Tarefas para o Claude no navegador (Claude in Chrome)

Copie cada bloco abaixo, **um de cada vez**, no Claude do navegador. Esteja logado no GitHub e no Cloudflare.
Regras para todas as tarefas:
- **Senhas:** o Claude deve parar e pedir para **você digitar** as senhas. Ele não deve inventar, ler em voz alta nem guardar senhas.
- Se uma tela estiver diferente do descrito (o Cloudflare muda menus com frequência), o Claude deve procurar a opção equivalente e avisar o que fez.

---

## Tarefa 1 — GitHub: criar o ramo `main`

```
No GitHub, abra https://github.com/cadastro-creator/SugesconTv.
1. Crie um ramo chamado "main" a partir do ramo "claude/adoring-planck-58djmy"
   (seletor de ramos → digite "main" → "Create branch main from claude/adoring-planck-58djmy").
2. Em Settings → General → Default branch, troque o ramo padrão para "main" e confirme.
3. Em Settings → Actions → General → Workflow permissions, marque "Read and write permissions" e salve.
4. Confirme que NÃO há regra de proteção em "main" que impeça o GitHub Actions de fazer push
   (Settings → Branches / Rules). Se houver, me avise e não altere.
Ao final, me diga o ramo padrão atual e se a aba Actions mostra o workflow "Testes" rodando ou concluído.
```

## Tarefa 2 — Cloudflare: criar o KV

```
No Cloudflare (https://dash.cloudflare.com), na minha conta:
1. Vá em Storage & Databases → KV (ou Workers & Pages → KV).
2. Clique em "Create" e crie um namespace chamado "sugescontv-dados".
Me confirme que ele aparece na lista.
```

## Tarefa 3 — Cloudflare: criar o projeto Pages ligado ao GitHub

```
No Cloudflare, vá em Workers & Pages → Create → aba Pages → "Connect to Git"
(se aparecer só a opção de Workers, procure o link "Pages" / "Looking to deploy Pages? Get started").
1. Conecte a conta do GitHub se for pedido, dando acesso ao repositório cadastro-creator/SugesconTv.
2. Escolha o repositório SugesconTv.
3. Configure:
   - Project name: sugescontv
   - Production branch: main
   - Framework preset: None
   - Build command: (deixe vazio)
   - Build output directory: public
4. Clique em "Save and Deploy" e espere terminar.
Me diga o endereço final do site (algo como https://sugescontv.pages.dev) e se o deploy deu sucesso.
```

## Tarefa 4 — Cloudflare: ligar o KV e criar a senha

```
No Cloudflare, abra Workers & Pages → projeto "sugescontv" → Settings.
1. Em "Bindings" → Add → "KV namespace":
   - Variable name: PAINEL_KV   (exatamente assim, maiúsculas)
   - KV namespace: sugescontv-dados
   Salve. Faça isso para Production (e também Preview, se houver a opção separada).
2. Em "Variables and Secrets" → Add:
   - Type: Secret (criptografado)
   - Variable name: ADMIN_PASSWORD
   - Value: PARE AQUI e me peça para digitar a senha eu mesmo. Não invente a senha.
   Salve (Production e Preview).
3. Vá em Deployments, no deploy mais recente de produção clique em "..." → "Retry deployment"
   e espere terminar.
Me confirme os dois itens salvos e o deploy concluído.
```

## Tarefa 5 — Testar o painel e criar a primeira tela

```
Abra https://sugescontv.pages.dev/admin (use o endereço real informado na tarefa 3).
1. Na tela de login, PARE e me peça para digitar a senha.
2. Depois de entrar, crie uma tela chamada "Teste" em "Criar tela".
3. No editor, clique no modelo pronto "Dólar (USD/BRL)" e confira se a prévia à direita mostra o gráfico.
4. Clique em "← Telas" e me diga o código da tela e o link da TV mostrados no cartão.
5. Abra o link da TV numa nova aba e confirme que o gráfico aparece em tela cheia.
Se aparecer erro falando de PAINEL_KV ou ADMIN_PASSWORD, refaça a tarefa 4.
```

## Tarefa 6 — GitHub: segredos e chave para o APK (só se for usar o app na TV)

```
No GitHub, abra https://github.com/cadastro-creator/SugesconTv → Settings → Secrets and variables → Actions → "New repository secret".
1. Crie ANDROID_KEY_ALIAS com o valor: sugescontv
2. Crie ANDROID_KEYSTORE_PASSWORD: PARE e me peça para digitar a senha (forte, que eu vou guardar).
3. Crie ANDROID_KEY_PASSWORD: PARE e me peça para digitar A MESMA senha do passo 2.
4. Vá em Actions → "Gerar chave do APK" → "Run workflow" (ramo main) e espere ficar verde.
5. Abra a execução concluída e baixe o artefato "chave-android". Me avise:
   EU vou abrir o arquivo ANDROID_KEYSTORE_BASE64.txt e copiar o conteúdo.
6. Crie o segredo ANDROID_KEYSTORE_BASE64 e PARE para eu colar o conteúdo copiado.
7. Volte à execução do passo 4 e apague o artefato "chave-android" (ícone de lixeira).
Nunca rode o "Gerar chave do APK" de novo depois disso.
```

## Tarefa 7 — GitHub: publicar a primeira versão do app

```
No GitHub, abra https://github.com/cadastro-creator/SugesconTv/releases → "Draft a new release".
1. Em "Choose a tag", digite v1.0.0 e escolha "Create new tag: v1.0.0 on publish" (alvo: main).
2. Título: SugesconTv 1.0.0. Clique em "Publish release".
3. Vá em Actions e acompanhe o workflow "APK para TV" até ficar verde.
4. Confirme que a Release v1.0.0 tem o arquivo sugescontv.apk anexado
   e que apareceu um commit "App da TV: versão 1.0.0" no ramo main.
5. Depois do novo deploy no Cloudflare, abra https://sugescontv.pages.dev/app/version.json
   e me diga o que aparece (deve ter "versionCode": 10000).
Se o workflow falhar, copie para mim a mensagem de erro do passo que ficou vermelho.
```

## Tarefa 8 — Deixar o site acordar o robô das fotos (modo imagem)

O agendamento do GitHub atrasa horas ou nem roda. Com esta chave, o próprio site pede ao GitHub
para ligar o robô quando as TVs estão ligadas e as fotos ficam velhas.

```
Parte A — GitHub (chave que só pode ligar o robô deste repositório):
1. Abra https://github.com/settings/personal-access-tokens/new (Fine-grained token).
2. Token name: sugescontv-robo-fotos
   Expiration: a mais longa disponível (anote a data para renovar).
   Resource owner: cadastro-creator
   Repository access: "Only select repositories" → SugesconTv
   Permissions → Repository permissions → Actions: "Read and write" (o resto fica sem acesso).
3. Clique em "Generate token". PARE AQUI: não leia nem copie o token para a conversa;
   peça para eu copiar o token eu mesmo.

Parte B — Cloudflare:
1. Workers & Pages → projeto "sugescontv" → Settings → Variables and Secrets → Add:
   - Type: Secret · Variable name: GITHUB_TOKEN
   - Value: PARE AQUI e me peça para colar o token eu mesmo.
   Salve (Production).
2. Deployments → no deploy mais recente de produção, "..." → "Retry deployment" e espere terminar.
Me confirme o segredo salvo e o deploy concluído.
```

---

Para versões novas do app depois: repita a Tarefa 7 com `v1.0.1`, `v1.1.0` etc. Mudanças nos dashboards **não** precisam de versão nova do app.
