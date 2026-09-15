const PRODUCTION_API_URL = 'https://inventario-iec.vercel.app'

const externalSecurity = [{ checklistBearerAuth: [] }, { checklistApiKey: [] }]
const internalSecurity = [{ nextAuthSession: [] }]

const uuidParam = (name = 'id', description = 'Identificador do registro.') => ({
  name,
  in: 'path',
  required: true,
  description,
  schema: { type: 'string', format: 'uuid' },
})

const jsonBody = (schema: Record<string, unknown>, required = true) => ({
  required,
  content: { 'application/json': { schema } },
})

const jsonResponse = (description: string, schema: Record<string, unknown>) => ({
  description,
  content: { 'application/json': { schema } },
})

const errorResponse = (description: string) => jsonResponse(description, { $ref: '#/components/schemas/ErrorResponse' })

const paginatedResponse = (itemRef: string) => ({
  type: 'object',
  properties: {
    data: { type: 'array', items: { $ref: itemRef } },
    total: { type: 'integer', example: 20 },
    page: { type: 'integer', example: 1 },
    totalPages: { type: 'integer', example: 1 },
  },
})

const paginationParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 }, description: 'Página atual.' },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 }, description: 'Quantidade por página.' },
]

const reviewPayload = {
  type: 'object',
  required: ['status_revisao'],
  properties: {
    status_revisao: { $ref: '#/components/schemas/StatusRevisao' },
  },
}

export function buildChecklistOpenApiSpec(origin?: string) {
  const serverUrl = origin || PRODUCTION_API_URL

  return {
    openapi: '3.0.3',
    info: {
      title: 'API Checklist - Inventário CRC',
      version: '1.0.0',
      description:
        'Documentação do módulo Checklist de Validação. As chamadas externas são usadas por Power Platform, Planner e CSC com token próprio. As chamadas internas são usadas pela interface autenticada do inventário.',
    },
    servers: [{ url: serverUrl, description: origin ? 'Ambiente atual' : 'Produção' }],
    tags: [
      {
        name: 'Checklist - Chamadas externas',
        description:
          'Endpoints para automações externas. Usam `CHECKLIST_INTEGRATION_TOKEN` em `Authorization: Bearer ...` ou `x-api-key`. Não usam sessão do inventário e não redirecionam para login.',
      },
      {
        name: 'Checklist - Chamadas internas',
        description:
          'Endpoints consumidos pela interface do inventário. Usam sessão autenticada do sistema e não aceitam o token de integração externa.',
      },
      {
        name: 'Checklist - Preenchimento interno',
        description: 'Endpoints usados pelo técnico para assumir, preencher, finalizar e reabrir solicitações.',
      },
      {
        name: 'Checklist - Revisão interna',
        description: 'Endpoints administrativos para gerar diffs, revisar campos, aprovar racks e assimilar alterações.',
      },
      {
        name: 'Checklist - Monitores internos',
        description: 'Endpoints internos para cadastro e alocação de monitores.',
      },
    ],
    'x-tagGroups': [
      { name: 'Integrações externas', tags: ['Checklist - Chamadas externas'] },
      {
        name: 'Sistema interno',
        tags: [
          'Checklist - Chamadas internas',
          'Checklist - Preenchimento interno',
          'Checklist - Revisão interna',
          'Checklist - Monitores internos',
        ],
      },
    ],
    paths: {
      '/api/checklist/solicitacoes-pendentes': {
        get: {
          tags: ['Checklist - Chamadas externas'],
          summary: 'Listar solicitações pendentes para o Planner',
          description:
            'Consulta solicitações ainda pendentes no eixo Planner para que o Power Platform crie ou sincronize tarefas. Token inválido retorna `401` em JSON, sem redirect para `/login`.',
          security: externalSecurity,
          responses: {
            '200': jsonResponse('Solicitações retornadas com sucesso.', {
              type: 'object',
              properties: { data: { type: 'array', items: { $ref: '#/components/schemas/ChecklistSolicitacaoExterna' } } },
            }),
            '401': errorResponse('Token de integração ausente ou inválido.'),
          },
        },
      },
      '/api/checklist/solicitacoes/{id}/atribuir': {
        post: {
          tags: ['Checklist - Chamadas externas'],
          summary: 'Registrar atribuição enviada pelo Planner',
          description:
            'Atualiza metadados do Planner e registra o técnico informado. Se a solicitação já estiver assumida por outro técnico incompatível, retorna `409`.',
          security: externalSecurity,
          parameters: [uuidParam('id', 'ID da solicitação de checklist.')],
          requestBody: jsonBody({ $ref: '#/components/schemas/ChecklistAtribuirPayload' }),
          responses: {
            '200': jsonResponse('Solicitação atribuída.', { $ref: '#/components/schemas/ChecklistSolicitacaoExterna' }),
            '401': errorResponse('Token de integração ausente ou inválido.'),
            '404': errorResponse('Solicitação não encontrada.'),
            '409': errorResponse('Conflito de técnico responsável.'),
          },
        },
      },
      '/api/checklist/solicitacoes/{id}/planner-id': {
        post: {
          tags: ['Checklist - Chamadas externas'],
          summary: 'Vincular ID da tarefa criada no Planner',
          description:
            'Recebe o `planner_task_id` logo após o Power Automate criar o card no Planner. Não assume, não conclui e não altera o status interno da solicitação. Se a solicitação já possuir outro ID Planner, retorna `409` para evitar vínculo incorreto.',
          security: externalSecurity,
          parameters: [uuidParam('id', 'ID da solicitação de checklist.')],
          requestBody: jsonBody({ $ref: '#/components/schemas/ChecklistPlannerIdPayload' }),
          responses: {
            '200': jsonResponse('ID do Planner vinculado à solicitação.', { $ref: '#/components/schemas/ChecklistSolicitacaoExterna' }),
            '401': errorResponse('Token de integração ausente ou inválido.'),
            '404': errorResponse('Solicitação não encontrada.'),
            '409': errorResponse('Solicitação já vinculada a outro ID do Planner.'),
          },
        },
      },
      '/api/checklist/solicitacoes/{id}/concluir': {
        post: {
          tags: ['Checklist - Chamadas externas'],
          summary: 'Registrar conclusão enviada pelo Planner',
          description:
            'Atualiza `planner_status = concluido`. Não revisa nem assimila inventário; a aprovação continua na interface administrativa.',
          security: externalSecurity,
          parameters: [uuidParam('id', 'ID da solicitação de checklist.')],
          requestBody: jsonBody({ $ref: '#/components/schemas/ChecklistConcluirPayload' }),
          responses: {
            '200': jsonResponse('Solicitação marcada como concluída no Planner.', { $ref: '#/components/schemas/ChecklistSolicitacaoExterna' }),
            '401': errorResponse('Token de integração ausente ou inválido.'),
            '404': errorResponse('Solicitação não encontrada.'),
          },
        },
      },
      '/api/checklists-validacao': {
        get: {
          tags: ['Checklist - Chamadas internas'],
          summary: 'Listar checklists de validação',
          description: 'Lista ciclos de checklist exibidos em `/checklists-validacao`. Requer sessão autenticada.',
          security: internalSecurity,
          parameters: [
            ...paginationParams,
            { name: 'status', in: 'query', schema: { $ref: '#/components/schemas/StatusChecklist' }, description: 'Filtra por status do ciclo.' },
          ],
          responses: {
            '200': jsonResponse('Lista paginada de checklists.', paginatedResponse('#/components/schemas/ChecklistValidacao')),
            '401': errorResponse('Usuário não autenticado.'),
          },
        },
        post: {
          tags: ['Checklist - Chamadas internas'],
          summary: 'Criar checklist de validação',
          description:
            'Cria um checklist por localidade e gera solicitações setoriais e, opcionalmente, de racks. Restrito a admin/dev.',
          security: internalSecurity,
          requestBody: jsonBody({ $ref: '#/components/schemas/CriarChecklistPayload' }),
          responses: {
            '201': jsonResponse('Checklist criado.', { $ref: '#/components/schemas/ChecklistValidacao' }),
            '401': errorResponse('Usuário não autenticado.'),
            '403': errorResponse('Usuário sem permissão administrativa.'),
          },
        },
      },
      '/api/checklists-validacao/{id}': {
        get: {
          tags: ['Checklist - Chamadas internas'],
          summary: 'Detalhar checklist',
          security: internalSecurity,
          parameters: [uuidParam('id', 'ID do checklist.')],
          responses: {
            '200': jsonResponse('Checklist encontrado.', { $ref: '#/components/schemas/ChecklistValidacaoDetalhe' }),
            '401': errorResponse('Usuário não autenticado.'),
            '404': errorResponse('Checklist não encontrado.'),
          },
        },
      },
      '/api/checklists-validacao/{id}/finalizar': {
        patch: {
          tags: ['Checklist - Chamadas internas'],
          summary: 'Finalizar checklist',
          description: 'Finaliza o ciclo geral. Restrito a admin/dev.',
          security: internalSecurity,
          parameters: [uuidParam('id', 'ID do checklist.')],
          responses: {
            '200': jsonResponse('Checklist finalizado.', { $ref: '#/components/schemas/ChecklistValidacao' }),
            '401': errorResponse('Usuário não autenticado.'),
            '403': errorResponse('Usuário sem permissão administrativa.'),
          },
        },
      },
      '/api/checklists-validacao/{id}/solicitacoes': {
        get: {
          tags: ['Checklist - Chamadas internas'],
          summary: 'Listar solicitações de um checklist',
          security: internalSecurity,
          parameters: [uuidParam('id', 'ID do checklist.')],
          responses: {
            '200': jsonResponse('Solicitações retornadas.', {
              type: 'object',
              properties: { data: { type: 'array', items: { $ref: '#/components/schemas/ChecklistSolicitacaoInterna' } } },
            }),
            '401': errorResponse('Usuário não autenticado.'),
          },
        },
      },
      '/api/checklists-validacao-solicitacoes': {
        get: {
          tags: ['Checklist - Chamadas internas'],
          summary: 'Listar solicitações',
          description: 'Lista solicitações para filas de preenchimento e revisão administrativa.',
          security: internalSecurity,
          parameters: [
            ...paginationParams,
            { name: 'status', in: 'query', schema: { type: 'string', example: 'finalizada,revisada' }, description: 'Lista separada por vírgula.' },
            { name: 'revisao', in: 'query', schema: { type: 'string', example: 'pendente,aprovado' }, description: 'Lista de status de revisão.' },
          ],
          responses: {
            '200': jsonResponse('Lista paginada de solicitações.', paginatedResponse('#/components/schemas/ChecklistSolicitacaoInterna')),
            '401': errorResponse('Usuário não autenticado.'),
          },
        },
      },
      '/api/checklists-validacao-solicitacoes/{id}': {
        get: {
          tags: ['Checklist - Preenchimento interno'],
          summary: 'Detalhar solicitação',
          description: 'Retorna solicitação, itens, resposta de rack e permissões calculadas. Use `review=1` para enriquecer dados da revisão.',
          security: internalSecurity,
          parameters: [
            uuidParam('id', 'ID da solicitação.'),
            { name: 'review', in: 'query', schema: { type: 'string', enum: ['1'] }, description: 'Inclui payload enriquecido para revisão.' },
          ],
          responses: {
            '200': jsonResponse('Solicitação encontrada.', { $ref: '#/components/schemas/ChecklistSolicitacaoDetalhe' }),
            '401': errorResponse('Usuário não autenticado.'),
            '404': errorResponse('Solicitação não encontrada.'),
          },
        },
      },
      '/api/checklists-validacao-solicitacoes/{id}/assumir': {
        patch: {
          tags: ['Checklist - Preenchimento interno'],
          summary: 'Assumir solicitação pela interface',
          description: 'Atribui a solicitação ao usuário logado. Esta ação não sincroniza de volta para o Planner.',
          security: internalSecurity,
          parameters: [uuidParam('id', 'ID da solicitação.')],
          responses: {
            '200': jsonResponse('Solicitação assumida.', { $ref: '#/components/schemas/ChecklistSolicitacaoInterna' }),
            '401': errorResponse('Usuário não autenticado.'),
            '409': errorResponse('Solicitação já assumida por outro técnico.'),
          },
        },
      },
      '/api/checklists-validacao-solicitacoes/{id}/finalizar': {
        patch: {
          tags: ['Checklist - Preenchimento interno'],
          summary: 'Finalizar solicitação',
          description: 'Finaliza a solicitação preenchida pelo técnico e gera estado pronto para revisão.',
          security: internalSecurity,
          parameters: [uuidParam('id', 'ID da solicitação.')],
          responses: {
            '200': jsonResponse('Solicitação finalizada.', { $ref: '#/components/schemas/ChecklistSolicitacaoInterna' }),
            '401': errorResponse('Usuário não autenticado.'),
          },
        },
      },
      '/api/checklists-validacao-solicitacoes/{id}/reabrir': {
        patch: {
          tags: ['Checklist - Preenchimento interno'],
          summary: 'Reabrir solicitação',
          description: 'Reabre solicitação finalizada/revisada quando ainda não foi assimilada. Ação auditada.',
          security: internalSecurity,
          parameters: [uuidParam('id', 'ID da solicitação.')],
          responses: {
            '200': jsonResponse('Solicitação reaberta.', { $ref: '#/components/schemas/ChecklistSolicitacaoInterna' }),
            '401': errorResponse('Usuário não autenticado.'),
            '409': errorResponse('Solicitação já assimilada ou bloqueada.'),
          },
        },
      },
      '/api/checklists-validacao-solicitacoes/{id}/itens': {
        get: {
          tags: ['Checklist - Preenchimento interno'],
          summary: 'Listar itens preenchidos',
          security: internalSecurity,
          parameters: [uuidParam('id', 'ID da solicitação.')],
          responses: {
            '200': jsonResponse('Itens retornados.', {
              type: 'object',
              properties: { data: { type: 'array', items: { $ref: '#/components/schemas/ChecklistItem' } } },
            }),
            '401': errorResponse('Usuário não autenticado.'),
          },
        },
        post: {
          tags: ['Checklist - Preenchimento interno'],
          summary: 'Criar ou atualizar item preenchido',
          description: 'Registra máquinas, ramais, monitores ou impressoras informados pelo técnico.',
          security: internalSecurity,
          parameters: [uuidParam('id', 'ID da solicitação.')],
          requestBody: jsonBody({ $ref: '#/components/schemas/ChecklistItemPayload' }),
          responses: {
            '201': jsonResponse('Item salvo.', { $ref: '#/components/schemas/ChecklistItem' }),
            '401': errorResponse('Usuário não autenticado.'),
          },
        },
      },
      '/api/checklists-validacao-itens/{id}': {
        patch: {
          tags: ['Checklist - Preenchimento interno'],
          summary: 'Editar item preenchido',
          security: internalSecurity,
          parameters: [uuidParam('id', 'ID do item.')],
          requestBody: jsonBody({ $ref: '#/components/schemas/ChecklistItemPayload' }, false),
          responses: {
            '200': jsonResponse('Item atualizado.', { $ref: '#/components/schemas/ChecklistItem' }),
            '401': errorResponse('Usuário não autenticado.'),
          },
        },
        delete: {
          tags: ['Checklist - Preenchimento interno'],
          summary: 'Excluir item preenchido',
          security: internalSecurity,
          parameters: [uuidParam('id', 'ID do item.')],
          responses: {
            '200': jsonResponse('Item removido.', { type: 'object', properties: { ok: { type: 'boolean', example: true } } }),
            '401': errorResponse('Usuário não autenticado.'),
          },
        },
      },
      '/api/checklists-validacao-solicitacoes/{id}/rack-resposta': {
        get: {
          tags: ['Checklist - Preenchimento interno'],
          summary: 'Consultar resposta de rack',
          security: internalSecurity,
          parameters: [uuidParam('id', 'ID da solicitação de rack.')],
          responses: {
            '200': jsonResponse('Resposta retornada.', { $ref: '#/components/schemas/RackResposta' }),
            '401': errorResponse('Usuário não autenticado.'),
          },
        },
        post: {
          tags: ['Checklist - Preenchimento interno'],
          summary: 'Salvar validação de rack',
          security: internalSecurity,
          parameters: [uuidParam('id', 'ID da solicitação de rack.')],
          requestBody: jsonBody({ $ref: '#/components/schemas/RackRespostaPayload' }),
          responses: {
            '201': jsonResponse('Resposta salva.', { $ref: '#/components/schemas/RackResposta' }),
            '401': errorResponse('Usuário não autenticado.'),
          },
        },
      },
      '/api/checklists-validacao-solicitacoes/{id}/gerar-diff': {
        post: {
          tags: ['Checklist - Revisão interna'],
          summary: 'Gerar diffs setoriais',
          description: 'Compara itens preenchidos com o inventário atual. Não se aplica a racks.',
          security: internalSecurity,
          parameters: [uuidParam('id', 'ID da solicitação setorial.')],
          responses: {
            '200': jsonResponse('Diffs gerados.', {
              type: 'object',
              properties: { data: { type: 'array', items: { $ref: '#/components/schemas/ChecklistDiff' } } },
            }),
            '401': errorResponse('Usuário não autenticado.'),
            '403': errorResponse('Usuário sem permissão administrativa.'),
          },
        },
      },
      '/api/checklists-validacao-solicitacoes/{id}/diffs': {
        get: {
          tags: ['Checklist - Revisão interna'],
          summary: 'Listar diffs da solicitação',
          security: internalSecurity,
          parameters: [uuidParam('id', 'ID da solicitação.')],
          responses: {
            '200': jsonResponse('Diffs retornados.', {
              type: 'object',
              properties: { data: { type: 'array', items: { $ref: '#/components/schemas/ChecklistDiff' } } },
            }),
            '401': errorResponse('Usuário não autenticado.'),
          },
        },
      },
      '/api/checklists-validacao-diffs/{id}/revisar': {
        patch: {
          tags: ['Checklist - Revisão interna'],
          summary: 'Aprovar ou recusar diff',
          security: internalSecurity,
          parameters: [uuidParam('id', 'ID do diff.')],
          requestBody: jsonBody(reviewPayload),
          responses: {
            '200': jsonResponse('Diff revisado.', { $ref: '#/components/schemas/ChecklistDiff' }),
            '401': errorResponse('Usuário não autenticado.'),
            '403': errorResponse('Usuário sem permissão administrativa.'),
          },
        },
      },
      '/api/checklists-validacao-itens/{id}/revisar': {
        patch: {
          tags: ['Checklist - Revisão interna'],
          summary: 'Aprovar ou recusar item inteiro',
          description: 'Aplica decisão aos diffs do item e recalcula o status parcial/aprovado/recusado.',
          security: internalSecurity,
          parameters: [uuidParam('id', 'ID do item.')],
          requestBody: jsonBody(reviewPayload),
          responses: {
            '200': jsonResponse('Item revisado.', { $ref: '#/components/schemas/ChecklistItem' }),
            '401': errorResponse('Usuário não autenticado.'),
            '403': errorResponse('Usuário sem permissão administrativa.'),
          },
        },
      },
      '/api/checklists-validacao-solicitacoes/{id}/assimilar': {
        post: {
          tags: ['Checklist - Revisão interna'],
          summary: 'Assimilar diffs aprovados',
          description: 'Aplica somente diffs aprovados ao inventário e registra auditoria das alterações aceitas.',
          security: internalSecurity,
          parameters: [uuidParam('id', 'ID da solicitação setorial.')],
          responses: {
            '200': jsonResponse('Mudanças assimiladas.', { $ref: '#/components/schemas/ChecklistAssimilacaoResponse' }),
            '401': errorResponse('Usuário não autenticado.'),
            '403': errorResponse('Usuário sem permissão administrativa.'),
          },
        },
      },
      '/api/checklists-validacao-solicitacoes/{id}/revisar-rack': {
        patch: {
          tags: ['Checklist - Revisão interna'],
          summary: 'Aprovar ou recusar solicitação de rack',
          description: 'Racks têm aceite geral, sem aprovação granular por diff.',
          security: internalSecurity,
          parameters: [uuidParam('id', 'ID da solicitação de rack.')],
          requestBody: jsonBody(reviewPayload),
          responses: {
            '200': jsonResponse('Rack revisado.', { $ref: '#/components/schemas/ChecklistSolicitacaoInterna' }),
            '401': errorResponse('Usuário não autenticado.'),
            '403': errorResponse('Usuário sem permissão administrativa.'),
          },
        },
      },
      '/api/checklists-validacao-solicitacoes/{id}/assimilar-rack': {
        post: {
          tags: ['Checklist - Revisão interna'],
          summary: 'Assimilar rack aprovado',
          description: 'Aplica integralmente a resposta do rack somente quando a solicitação foi aprovada.',
          security: internalSecurity,
          parameters: [uuidParam('id', 'ID da solicitação de rack.')],
          responses: {
            '200': jsonResponse('Rack assimilado.', { $ref: '#/components/schemas/ChecklistAssimilacaoResponse' }),
            '401': errorResponse('Usuário não autenticado.'),
            '403': errorResponse('Usuário sem permissão administrativa.'),
          },
        },
      },
      '/api/monitores': {
        get: {
          tags: ['Checklist - Monitores internos'],
          summary: 'Listar monitores',
          description: 'Lista monitores do inventário, incluindo os criados via checklist e suas alocações ativas.',
          security: internalSecurity,
          parameters: [
            ...paginationParams,
            { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Busca por patrimônio, marca, modelo ou máquina.' },
            { name: 'setor_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'localidade_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'alocacao', in: 'query', schema: { type: 'string', enum: ['alocado', 'livre'] } },
          ],
          responses: {
            '200': jsonResponse('Monitores retornados.', paginatedResponse('#/components/schemas/Monitor')),
            '401': errorResponse('Usuário não autenticado.'),
          },
        },
        post: {
          tags: ['Checklist - Monitores internos'],
          summary: 'Criar monitor',
          security: internalSecurity,
          requestBody: jsonBody({ $ref: '#/components/schemas/MonitorPayload' }),
          responses: {
            '201': jsonResponse('Monitor criado.', { $ref: '#/components/schemas/Monitor' }),
            '401': errorResponse('Usuário não autenticado.'),
          },
        },
      },
      '/api/monitores/{id}': {
        get: {
          tags: ['Checklist - Monitores internos'],
          summary: 'Detalhar monitor',
          security: internalSecurity,
          parameters: [uuidParam('id', 'ID do monitor.')],
          responses: {
            '200': jsonResponse('Monitor encontrado.', { $ref: '#/components/schemas/Monitor' }),
            '401': errorResponse('Usuário não autenticado.'),
            '404': errorResponse('Monitor não encontrado.'),
          },
        },
        patch: {
          tags: ['Checklist - Monitores internos'],
          summary: 'Atualizar monitor',
          security: internalSecurity,
          parameters: [uuidParam('id', 'ID do monitor.')],
          requestBody: jsonBody({ $ref: '#/components/schemas/MonitorPayload' }, false),
          responses: {
            '200': jsonResponse('Monitor atualizado.', { $ref: '#/components/schemas/Monitor' }),
            '401': errorResponse('Usuário não autenticado.'),
          },
        },
      },
      '/api/monitores/gerar-codigo-interno': {
        post: {
          tags: ['Checklist - Monitores internos'],
          summary: 'Gerar patrimônio interno de monitor',
          description: 'Gera um código único `MON-0000` para monitor sem patrimônio físico.',
          security: internalSecurity,
          responses: {
            '200': jsonResponse('Código gerado.', {
              type: 'object',
              properties: { codigo: { type: 'string', example: 'MON-4827' } },
            }),
            '401': errorResponse('Usuário não autenticado.'),
          },
        },
      },
      '/api/alocacoes-monitores': {
        post: {
          tags: ['Checklist - Monitores internos'],
          summary: 'Alocar ou realocar monitor',
          description: 'Encerra alocação ativa anterior do monitor, cria o novo vínculo com máquina/setor e audita a operação.',
          security: internalSecurity,
          requestBody: jsonBody({ $ref: '#/components/schemas/AlocacaoMonitorPayload' }),
          responses: {
            '201': jsonResponse('Alocação criada.', { $ref: '#/components/schemas/AlocacaoMonitor' }),
            '401': errorResponse('Usuário não autenticado.'),
          },
        },
      },
      '/api/alocacoes-monitores/{id}/encerrar': {
        post: {
          tags: ['Checklist - Monitores internos'],
          summary: 'Encerrar alocação de monitor',
          security: internalSecurity,
          parameters: [uuidParam('id', 'ID da alocação.')],
          responses: {
            '200': jsonResponse('Alocação encerrada.', { $ref: '#/components/schemas/AlocacaoMonitor' }),
            '401': errorResponse('Usuário não autenticado.'),
          },
        },
      },
      '/api/maquinas/{id}/monitores': {
        get: {
          tags: ['Checklist - Monitores internos'],
          summary: 'Listar monitores de uma máquina',
          security: internalSecurity,
          parameters: [uuidParam('id', 'ID da máquina.')],
          responses: {
            '200': jsonResponse('Monitores vinculados à máquina.', {
              type: 'object',
              properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Monitor' } } },
            }),
            '401': errorResponse('Usuário não autenticado.'),
          },
        },
      },
    },
    components: {
      securitySchemes: {
        checklistBearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'CHECKLIST_INTEGRATION_TOKEN',
          description: 'Token externo do checklist. Exemplo: `Authorization: Bearer <CHECKLIST_INTEGRATION_TOKEN>`.',
        },
        checklistApiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'Alternativa ao Bearer token para automações do Power Platform.',
        },
        nextAuthSession: {
          type: 'apiKey',
          in: 'cookie',
          name: 'next-auth.session-token',
          description: 'Sessão autenticada da interface do inventário. Em produção pode usar o cookie seguro do NextAuth.',
        },
      },
      schemas: {
        StatusChecklist: { type: 'string', enum: ['aberto', 'finalizado'] },
        TipoSolicitacao: { type: 'string', enum: ['SETOR', 'RACK', 'ESTOQUE'] },
        StatusSolicitacao: { type: 'string', enum: ['aberta', 'assumida', 'finalizada', 'revisada'] },
        PlannerStatus: { type: 'string', enum: ['pendente', 'assumido', 'concluido'] },
        StatusRevisao: { type: 'string', enum: ['pendente', 'aprovado', 'recusado', 'parcial'] },
        TipoItem: { type: 'string', enum: ['MAQUINA', 'RAMAL', 'MONITOR', 'IMPRESSORA', 'NOTEBOOK', 'APARELHO'] },
        TipoDiff: { type: 'string', enum: ['sem_divergencia', 'alterado', 'novo', 'ausente', 'vinculo_divergente'] },
        ChecklistSolicitacaoExterna: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            tipo_solicitacao: { $ref: '#/components/schemas/TipoSolicitacao' },
            status: { $ref: '#/components/schemas/StatusSolicitacao' },
            planner_status: { $ref: '#/components/schemas/PlannerStatus' },
            planner_task_id: { type: 'string', nullable: true },
            tecnico_nome: { type: 'string', nullable: true },
            checklist_nome: { type: 'string', nullable: true },
            localidade_nome: { type: 'string', nullable: true },
            setor_nome: { type: 'string', nullable: true },
            rack_nome: { type: 'string', nullable: true },
            link_inventario: { type: 'string', nullable: true, example: 'https://inventario-iec.vercel.app/checklists-validacao/solicitacoes/...' },
          },
        },
        ChecklistAtribuirPayload: {
          type: 'object',
          required: ['tecnico_nome'],
          properties: {
            planner_task_id: { type: 'string', nullable: true, example: 'planner-task-123' },
            tecnico_nome: { type: 'string', example: 'Maria Souza' },
            tecnico_email: { type: 'string', nullable: true, example: 'maria@pucminas.br' },
            tecnico_codigo_pessoa: { type: 'string', nullable: true, example: '123456' },
            atribuido_em: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        ChecklistPlannerIdPayload: {
          type: 'object',
          required: ['planner_task_id'],
          properties: {
            planner_task_id: { type: 'string', example: 'planner-task-123' },
            origem: { type: 'string', nullable: true, example: 'Power Automate' },
            criado_em: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'Informativo para auditoria externa. O inventário usa o horário de recebimento como data de atualização.',
            },
            observacao: { type: 'string', nullable: true },
          },
        },
        ChecklistConcluirPayload: {
          type: 'object',
          properties: {
            planner_task_id: { type: 'string', nullable: true, example: 'planner-task-123' },
            concluido_em: { type: 'string', format: 'date-time', nullable: true },
            observacao: { type: 'string', nullable: true },
          },
        },
        CriarChecklistPayload: {
          type: 'object',
          required: ['nome', 'localidade_id'],
          properties: {
            nome: { type: 'string', example: 'Checklist de Validação - São Gabriel - 2026.2' },
            localidade_id: { type: 'string', format: 'uuid' },
            incluir_racks: { type: 'boolean', default: false },
            data_inicio: { type: 'string', format: 'date', nullable: true },
          },
        },
        ChecklistValidacao: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            nome: { type: 'string' },
            localidade_id: { type: 'string', format: 'uuid' },
            localidade_nome: { type: 'string', nullable: true },
            incluir_racks: { type: 'boolean' },
            status: { $ref: '#/components/schemas/StatusChecklist' },
            data_inicio: { type: 'string', format: 'date-time', nullable: true },
            total_solicitacoes: { type: 'integer' },
            finalizadas: { type: 'integer' },
            revisadas: { type: 'integer' },
          },
        },
        ChecklistValidacaoDetalhe: {
          allOf: [
            { $ref: '#/components/schemas/ChecklistValidacao' },
            {
              type: 'object',
              properties: {
                solicitacoes: { type: 'array', items: { $ref: '#/components/schemas/ChecklistSolicitacaoInterna' } },
              },
            },
          ],
        },
        ChecklistSolicitacaoInterna: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            checklist_validacao_id: { type: 'string', format: 'uuid' },
            tipo_solicitacao: { $ref: '#/components/schemas/TipoSolicitacao' },
            setor_id: { type: 'string', format: 'uuid', nullable: true },
            rack_id: { type: 'string', format: 'uuid', nullable: true },
            status: { $ref: '#/components/schemas/StatusSolicitacao' },
            status_revisao: { $ref: '#/components/schemas/StatusRevisao' },
            planner_status: { $ref: '#/components/schemas/PlannerStatus' },
            assumido_por: { type: 'string', format: 'uuid', nullable: true },
            tecnico_nome: { type: 'string', nullable: true },
            setor_nome: { type: 'string', nullable: true },
            rack_nome: { type: 'string', nullable: true },
            link_inventario: { type: 'string', nullable: true },
            total_itens: { type: 'integer', nullable: true },
            total_diffs: { type: 'integer', nullable: true },
            cobertura: { type: 'object', additionalProperties: true, nullable: true },
          },
        },
        ChecklistSolicitacaoDetalhe: {
          allOf: [
            { $ref: '#/components/schemas/ChecklistSolicitacaoInterna' },
            {
              type: 'object',
              properties: {
                itens: { type: 'array', items: { $ref: '#/components/schemas/ChecklistItem' } },
                rack_resposta: { $ref: '#/components/schemas/RackResposta' },
                pode_assumir: { type: 'boolean' },
                pode_editar: { type: 'boolean' },
                pode_finalizar: { type: 'boolean' },
                pode_reabrir: { type: 'boolean' },
              },
            },
          ],
        },
        ChecklistItemPayload: {
          type: 'object',
          required: ['tipo_item'],
          properties: {
            tipo_item: { $ref: '#/components/schemas/TipoItem' },
            dados_informados_json: { type: 'object', additionalProperties: true },
            dados: { type: 'object', additionalProperties: true, description: 'Alias aceito para `dados_informados_json`.' },
          },
        },
        ChecklistItem: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            checklist_validacao_solicitacao_id: { type: 'string', format: 'uuid' },
            tipo_item: { $ref: '#/components/schemas/TipoItem' },
            referencia_id: { type: 'string', format: 'uuid', nullable: true },
            identificador_informado: { type: 'string', nullable: true },
            dados_informados_json: { type: 'object', additionalProperties: true },
            status_revisao: { $ref: '#/components/schemas/StatusRevisao' },
            diffs: { type: 'array', items: { $ref: '#/components/schemas/ChecklistDiff' } },
          },
        },
        ChecklistDiff: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            checklist_validacao_item_id: { type: 'string', format: 'uuid' },
            campo: { type: 'string', example: 'setor_id' },
            valor_atual: { nullable: true },
            valor_informado: { nullable: true },
            tipo_diff: { $ref: '#/components/schemas/TipoDiff' },
            status_revisao: { $ref: '#/components/schemas/StatusRevisao' },
          },
        },
        RackRespostaPayload: {
          type: 'object',
          properties: {
            dados_informados_json: { type: 'object', additionalProperties: true },
            observacoes: { type: 'string', nullable: true },
          },
        },
        RackResposta: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            checklist_validacao_solicitacao_id: { type: 'string', format: 'uuid' },
            rack_id: { type: 'string', format: 'uuid' },
            dados_informados_json: { type: 'object', additionalProperties: true },
            observacoes: { type: 'string', nullable: true },
            preenchido_em: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        ChecklistAssimilacaoResponse: {
          type: 'object',
          properties: {
            ok: { type: 'boolean', example: true },
            assimilados: { type: 'integer', nullable: true },
            solicitacao: { $ref: '#/components/schemas/ChecklistSolicitacaoInterna' },
          },
        },
        MonitorPayload: {
          type: 'object',
          properties: {
            patrimonio: { type: 'string', nullable: true, example: 'MON-4827' },
            marca: { type: 'string', nullable: true, example: 'Dell' },
            modelo: { type: 'string', nullable: true, example: 'P2422H' },
            tamanho: { type: 'string', nullable: true, enum: ['pequeno', 'medio', 'grande'] },
            status: { type: 'string', nullable: true, default: 'ativo' },
            criado_via_checklist: { type: 'boolean', default: false },
          },
        },
        Monitor: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            patrimonio: { type: 'string', nullable: true },
            marca: { type: 'string', nullable: true },
            modelo: { type: 'string', nullable: true },
            tamanho: { type: 'string', nullable: true },
            status_text: { type: 'string', nullable: true },
            criado_via_checklist: { type: 'boolean' },
            maquina_id: { type: 'string', format: 'uuid', nullable: true },
            maquina_nome: { type: 'string', nullable: true },
            setor_id: { type: 'string', format: 'uuid', nullable: true },
            setor_nome: { type: 'string', nullable: true },
            localidade_id: { type: 'string', format: 'uuid', nullable: true },
            localidade_nome: { type: 'string', nullable: true },
            colaboradores_nomes: { type: 'array', items: { type: 'string' } },
          },
        },
        AlocacaoMonitorPayload: {
          type: 'object',
          required: ['monitor_id'],
          properties: {
            monitor_id: { type: 'string', format: 'uuid' },
            maquina_id: { type: 'string', format: 'uuid', nullable: true },
            setor_id: { type: 'string', format: 'uuid', nullable: true },
            data_inicio: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        AlocacaoMonitor: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            monitor_id: { type: 'string', format: 'uuid' },
            maquina_id: { type: 'string', format: 'uuid', nullable: true },
            setor_id: { type: 'string', format: 'uuid', nullable: true },
            ativo: { type: 'boolean' },
            data_inicio: { type: 'string', format: 'date-time', nullable: true },
            data_fim: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: { error: { type: 'string' } },
        },
      },
    },
  }
}
