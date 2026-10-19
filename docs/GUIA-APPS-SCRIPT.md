# Guia — publicar a planilha e o Apps Script

Tempo estimado: 15 minutos. Faça tudo logado como **nao-responda@coopedu.app.br** (essa conta é a dona da planilha e a remetente dos e-mails).

## 1. Criar a planilha
1. No Google Drive, crie uma planilha em branco chamada **SIC – Leads Evento**.
2. Menu **Extensões › Apps Script**. Abre o editor em outra aba.

## 2. Colar o código
1. No editor, renomeie o projeto (canto superior esquerdo) para **SIC Leads Evento**.
2. Apague todo o conteúdo do arquivo `Código.gs` e cole o conteúdo de [`apps-script/Code.gs`](../apps-script/Code.gs).
3. Clique em **Salvar** (ícone de disquete).
4. Em **Configurações do projeto** (engrenagem, à esquerda), confira o fuso horário: **(GMT-03:00) Horário de Brasília**.

## 3. Rodar o setup (uma vez)
1. Volte ao **Editor** (`< >`), escolha a função **`setup`** na lista ao lado de "Depurar" e clique em **Executar**.
2. O Google pede autorização: **Revisar permissões › escolher a conta nao-responda@ › Permitir**.
   Se aparecer "O Google não verificou este app", clique em **Avançado › Acessar SIC Leads Evento**.
   As permissões pedidas são: ver e editar planilhas, enviar e-mail como você e conectar a serviço externo.
3. Na janela **Registro de execução** aparece `TOTEM_KEY = …` — **guarde esse valor** (vai no site, config.js).
   O usuário do `/painel` é **SIC**. Defina a senha em **Configurações do projeto › Propriedades do script › PAINEL_SENHA** (o setup cria uma aleatória).
4. Volte à planilha: as abas **Leads, Participações, Cupons, Prêmios, Config, Mensagens, Log e Resumo** foram criadas.

> Para trocar o login do painel depois: **Configurações do projeto › Propriedades do script › PAINEL_USUARIO / PAINEL_SENHA › editar**.

## 4. Testar o e-mail
1. No editor, escolha a função **`testarEmail`** e clique em **Executar**.
2. Confira a caixa de entrada de nao-responda@coopedu.app.br: chega o e-mail de boas-vindas com um cupom de exemplo.

## 5. Publicar como App da Web
1. **Implantar › Nova implantação**.
2. Engrenagem ao lado de "Selecionar tipo" › **App da Web**.
3. Preencha:
   - Descrição: `v1`
   - Executar como: **Eu (nao-responda@coopedu.app.br)**
   - Quem pode acessar: **Qualquer pessoa**
4. **Implantar** e copie a **URL do app da Web** (termina em `/exec`).

> Se a opção "Qualquer pessoa" não aparecer (só "Qualquer pessoa em coopedu.app.br"), o administrador do Google Workspace precisa liberar o compartilhamento de Apps Script fora do domínio. Sem isso, o totem não consegue enviar os dados.

## 6. Me enviar
- A URL `/exec`
- O valor de `TOTEM_KEY`

Com isso eu preencho o `config.js`, publico o site e fazemos o ensaio de ponta a ponta.

## Atualizar o código depois (mantendo a mesma URL)
1. Cole o novo `Code.gs` e salve.
2. **Implantar › Gerenciar implantações › lápis (editar) › Versão: Nova versão › Implantar**.
   Criar uma *nova implantação* geraria outra URL — evite.

## Antes de abrir o estande (cada dia)
1. No `/painel`, aba **Setup do dia**: confira as datas do Dia 1 e Dia 2, as chances e os tetos. Salve.
2. No totem, painel **Equipe › Configurações**: confira "Conexão: Ativa" e "Pendentes de envio: 0".

## Limpar os dados de ensaio (antes do Dia 1)
1. Na planilha, apague as linhas (mantendo o cabeçalho) das abas **Leads, Participações, Cupons e Log**.
2. No totem, painel **Equipe › Leads › Apagar todos os dados** (confirmar).
