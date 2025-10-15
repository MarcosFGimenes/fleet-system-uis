# Integração com Firebase – Checklists de Operação

Este documento descreve a estrutura de dados e os fluxos principais do módulo de checklist operacional integrado ao Firebase (Firestore e Storage).

## Visão Geral

O checklist é acessado pelos operadores por meio de um QR Code exclusivo de cada máquina. Assim que o código é lido e a página correspondente é aberta, o sistema carrega:

- **Dados do operador**: a matrícula informada é validada na coleção `users`. Quando reconhecida, o nome e a função (por exemplo, `operador`) são preenchidos automaticamente.
- **Dados da máquina**: o QR Code contém a `tag` cadastrada na coleção `machines`. Com ela o sistema recupera modelo, placa, setor e demais propriedades relevantes.
- **Não conformidades pendentes**: se o checklist anterior da mesma máquina/template tiver itens marcados como "NC", eles são exibidos para confirmação de solução.

Leituras variáveis, como horímetro ou quilometragem, continuam sendo preenchidas manualmente pelo operador a cada envio.

## Templates de Checklist (`checklistTemplates`)

Cada template determina o conjunto de perguntas e configurações do checklist. Campos importantes:

- `title`: nome apresentado ao operador, por exemplo `Diário trator com grua`.
- `type`: perfil responsável (`operador`, `mecanico`, etc.).
- `version`: número de versão do template.
- `isActive`: indica disponibilidade para uso.
- `questions`: lista de itens, cada um com:
  - `id`: identificador único.
  - `text`: enunciado apresentado.
  - `photoRule`: regra de foto (`none`, `optional`, `required_nc`).
  - `requiresPhoto`: campo legado equivalente ao comportamento de foto obrigatória em caso de NC.
- `periodicity` (opcional): define intervalo exigido entre envios (ex.: `quantity: 1`, `unit: day`, `anchor: last_submission`, `windowDays: 1`).

## Cadastro de Usuários (`users`)

Registra operadores e demais perfis:

- `matricula`: código do funcionário.
- `nome`: nome completo.
- `role`: papel no sistema.
- `setor`: área de atuação.

Durante o preenchimento do checklist, a matrícula digitada é verificada nessa coleção. O nome e a função são salvos na resposta juntamente com o `userId`.

## Cadastro de Máquinas (`machines`)

Cada documento descreve uma máquina e os checklists aplicáveis:

- `modelo`, `placa`, `setor`, `combustivel` (opcional).
- `tag`: identificador utilizado no QR Code.
- `checklists`: lista com os IDs dos templates habilitados.

Ao acessar o checklist via QR Code, o aplicativo busca a máquina pela `tag`, exibe suas informações e carrega os templates relacionados. Quando mais de um template estiver associado, o operador poderá escolher qual executar.

## Respostas de Checklist (`checklistResponses`)

Cada envio gera um documento contendo:

- Referências à máquina (`machineId`) e ao template (`templateId`).
- Dados do operador (`userId`, `operatorMatricula`, `operatorNome`).
- `createdAt` (ISO string) e `createdAtTs` (timestamp do servidor).
- Leituras contextuais (`km`, `horimetro`, etc.).
- `answers`: lista com as respostas individuais, cada uma com:
  - `questionId` e `response` (`ok`, `nc`, `na`).
  - `observation`: texto complementar.
  - `photoUrls`: array de URLs das evidências (suporta múltiplas fotos; campo legado `photoUrl` mantém compatibilidade).
  - `recurrence`: presente quando há vínculo com uma NC anterior, contendo `previousResponseId`, `status` (`resolved` ou `still_nc`) e `notedAt`.
- `nonConformityTreatments` e `extraNonConformities`: estruturas opcionais para gestão de NCs fora do fluxo diário.

## Fluxo de Não Conformidades Repetidas

1. Ao abrir o checklist, o sistema busca a resposta anterior mais recente (`checklistResponses`) para a mesma máquina/template.
2. Perguntas respondidas como `nc` no último envio são reunidas em um mapa e apresentadas ao operador com observações e fotos anteriores.
3. Antes de enviar o novo checklist, o operador deve informar se cada pendência foi **resolvida** ou continua **não conforme**.
4. Durante o envio, essa decisão gera o campo `recurrence` na resposta atual, ligando a ocorrência ao `previousResponseId` e marcando o status apropriado.
5. Novas não conformidades (não presentes no histórico imediato) são registradas sem `recurrence` e passam a ser monitoradas a partir do próximo checklist.

## Upload de Fotos

Evidências fotográficas são enviadas ao Firebase Storage. Os arquivos são carregados (via `uploadBytes`), e seus links públicos (`getDownloadURL`) são armazenados em `photoUrls` dentro de cada resposta.

## Possíveis Extensões

- **Sugestão de horímetro/KM**: aproveitar a leitura do último checklist para sugerir ou pré-preencher o valor atual.
- **Validação de periodicidade**: utilizar `periodicity` para alertar/bloquear envios fora da janela prevista (por exemplo, impedir dois checklists no mesmo dia quando `anchor` for `last_submission`).

Este resumo serve como referência rápida para manutenção e evolução do módulo de checklists integrados ao Firebase.
