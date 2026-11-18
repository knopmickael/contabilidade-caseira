# Controle de Gastos (Contabilidade)

Aplicação web local para controle de finanças pessoais, organizada em um quadro estilo Kanban com uma coluna por mês. Cada coluna reúne as entradas (receitas) e os gastos do mês, agrupados por categoria, e mostra quanto sobra no fim, com um saldo separado para o VA (vale-alimentação).

O frontend é HTML/CSS/JavaScript puro, sem frameworks nem build. O backend é um servidor Node.js sem dependências externas que persiste o estado em SQLite.

## Features

### Quadro mensal
- Uma coluna por mês, com badge **mês atual** ou **arquivado**.
- Limite de 6 meses ativos ao mesmo tempo.
- **+ Abrir novo mês** cria o mês seguinte ao último ativo, duplicando a coluna anterior:
  - as entradas e o valor do VA são copiados;
  - os gastos são copiados;
  - gastos parcelados avançam uma parcela e saem quando chegam à última.
- Se não houver nenhum mês ativo, o botão recria o mês corrente.
- Arquivar e restaurar colunas manualmente. Meses anteriores ao atual aparecem automaticamente em **Arquivados**.
- Alternância entre as visões **Arquivados** e **Corrente**.
- Exclusão de uma coluna inteira, com confirmação.
- Detecção de virada de mês: a cada 30 segundos o app verifica se o mês mudou e reorganiza o quadro.
- A posição do scroll de cada coluna é preservada ao atualizar a tela.

### Entradas (receitas)
- Várias entradas por mês, cada uma com nome e valor.
- Adição, edição inline e exclusão (com confirmação).
- `Enter` confirma e `Esc` cancela.

### Gastos
- Cadastro com nome, valor (R$), categoria e subcategoria, em um modal.
- Gastos sem categoria aparecem no topo. Os demais ficam em grupos por categoria, com total por grupo.
- Grupos recolhíveis ao clicar no cabeçalho.
- Subcategorias viram grupos aninhados, com subtotal.
- Ordenação alfabética em pt-BR, ignorando acentos e caixa e tratando números de forma natural.
- Botão de **olho** para desabilitar um gasto. Ele fica esmaecido e deixa de entrar nos totais.
- Edição e exclusão (com confirmação).
- **Drag and drop** para reordenar:
  - categorias entre si, o que define a ordem de exibição;
  - gastos sem categoria dentro do mês.

### Replicação e parcelamento
- **Replicar** um gasto novo em outros meses ativos, escolhidos em uma lista.
- **Parcelado**: define o total de parcelas (1 a 120) e a parcela atual.
  - O gasto é lançado nos meses seguintes que já existem, com marcação `[i/total]`.
  - Se faltarem meses, o app avisa quantas parcelas foram criadas.
  - Parcelamento e replicação são mutuamente exclusivos.
- Ao desabilitar ou habilitar um gasto parcelado, o app pergunta se vale só para aquela parcela ou para todas.

### VA (vale-alimentação)
- Cada mês tem um campo **VA do mês (R$)** no rodapé: informe o valor e clique em **Salvar VA** ou pressione `Enter`. `Esc` cancela a edição. Valores negativos ou inválidos são rejeitados; zero é permitido.
- Ao duplicar um mês, o VA é herdado do mês anterior, junto com as entradas e os gastos. Depois, cada mês pode ser editado independentemente. O padrão de R$ 703 só é usado quando não existe um valor anterior para copiar.
- Gastos da categoria **Mercado** têm um botão **VA** para marcar que foram pagos com o vale.
- Gastos marcados como VA saem do cálculo do restante e abatem do saldo do VA.

### Categorias
- Modal de categorias para adicionar, renomear e excluir categorias e subcategorias.
- Nomes de categoria duplicados são rejeitados.
- Renomear uma subcategoria atualiza os gastos já lançados.
- Excluir uma categoria ou subcategoria deixa os gastos dela sem categoria ou sem subcategoria.
- Criação rápida de categoria ou subcategoria direto no modal de gasto.

### Totais
O rodapé de cada coluna mostra:
- **Entradas** e **Gastos** (apenas gastos habilitados e não VA);
- **Restante** = entradas − gastos, em verde ou vermelho conforme o sinal;
- **VA restante** = VA do mês − gastos pagos com VA, e o VA do mês.

Os valores aceitam formatos como `1.234,56`, `10,5` ou `R$ 10`, e são exibidos em BRL.

### Interface
- Dois temas, **Frutiger Aero** (padrão) e **Neon**, com a escolha salva no navegador.
- Avisos por toast e atalho `Esc` para fechar modais.

### Persistência
- O estado completo é enviado ao servidor e salvo no SQLite local `contabilidade.db`.
- O salvamento é automático, com debounce de 250 ms, a cada alteração.
- Na primeira execução, o banco pode ser populado por um arquivo opcional `seed-data.js` (`window.SEED_DATA = {...}`). Sem ele, o app começa vazio com o mês corrente.

## Tecnologias

- Frontend: HTML, CSS e JavaScript puro (`index.html`, `styles.css`, `app.js`)
- Backend: Node.js com `node:http` e `node:sqlite` (SQLite embutido)
- Sem dependências npm

## Requisitos

- Node.js com suporte ao módulo `node:sqlite`. A flag `--experimental-sqlite` é usada no start.

## Como executar

```bash
npm start
```

Depois abra http://localhost:3000. A porta pode ser alterada com a variável de ambiente `PORT`.

No Windows, o arquivo `iniciar-contabilidade.bat` sobe o servidor e abre o navegador automaticamente.

## Estrutura

| Arquivo | Descrição |
| --- | --- |
| `server.js` | Servidor HTTP: arquivos estáticos e API de estado |
| `app.js` | Lógica do frontend (render, modais, drag and drop, cálculos) |
| `index.html` | Estrutura da página e modais |
| `styles.css` | Estilos e temas |
| `iniciar-contabilidade.bat` | Atalho para iniciar no Windows |
| `contabilidade.db` | Banco SQLite (ignorado pelo git) |

## API

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/api/state` | Retorna o estado completo (categorias e meses) |
| POST | `/api/state` | Substitui o estado salvo (corpo JSON) |

## Dados

O estado fica em uma única linha da tabela `state` (chave `app`), serializado como JSON com `categories` e `months`. Cada mês guarda `va`, `entries`, `expenses` e `archived`. Os arquivos `*.db`, `*.db.*` e `*.log` estão no `.gitignore`, então faça backup do `contabilidade.db` por conta própria.
